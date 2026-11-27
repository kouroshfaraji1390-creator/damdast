
// ---- number to Persian words (same logic as tool.html) ----
var _ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
var _TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
var _TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
var _HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
var _SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون', 'کوادریلیون'];
function _threeDigits(n) {
  var parts = [], h = Math.floor(n / 100), t = n % 100;
  if (h) parts.push(_HUNDREDS[h]);
  if (t >= 20) { parts.push(_TENS[Math.floor(t / 10)]); if (t % 10) parts.push(_ONES[t % 10]); }
  else if (t >= 10) parts.push(_TEENS[t - 10]);
  else if (t > 0) parts.push(_ONES[t]);
  return parts.join(' و ');
}
function toPersianWords(raw) {
  var s = String(raw).trim()
    .replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); })
    .replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
    .replace(/[,\s٬]/g, '');
  if (!/^-?\d+$/.test(s)) return null;
  var neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1); }
  s = s.replace(/^0+(?=\d)/, '');
  if (s === '0') return 'صفر';
  if (s.length > 15) return null;
  var groups = [];
  for (var i = s.length; i > 0; i -= 3) groups.unshift(s.slice(Math.max(0, i - 3), i));
  var parts = [];
  groups.forEach(function (g, idx) {
    var n = parseInt(g, 10);
    if (!n) return;
    var scale = _SCALES[groups.length - 1 - idx];
    parts.push(_threeDigits(n) + (scale ? ' ' + scale : ''));
  });
  return (neg ? 'منفی ' : '') + parts.join(' و ');
}
function formatMoney(n) {
  return Number(n).toLocaleString('en-US') + ' تومان';
}
function faNum(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }).replace(/,/g, '٬'); }

// ---- invoice math (pure) ----
// All money is whole tomans: line amounts and the discount are rounded,
// so the total is always an integer and toPersianWords always applies.
// Validation happens BEFORE calculating: the tax rate must be within
// 0–100, all inputs must be finite, and the total must stay inside the
// number-to-words range (15 digits). Invalid input is rejected with
// { valid: false, error } — never silently accepted.
function calcInvoice(items, discount, taxRate) {
  var sum = 0;
  for (var i = 0; i < items.length; i++) {
    var q = +items[i].qty, p = +items[i].price;
    if (!isFinite(q) || !isFinite(p)) return { valid: false, error: 'مقادیر اقلام باید عدد معتبر باشند.' };
    sum += Math.round(Math.max(0, q) * Math.max(0, p));
  }
  if (!isFinite(sum)) return { valid: false, error: 'جمع اقلام خارج از محدوده است.' };
  // The discount is validated BEFORE any defaulting or clamping:
  // non-finite, negative, or larger-than-subtotal discounts are
  // rejected with an error — never silently turned into 0 or clamped
  // (Nola regression: a NaN discount produced a valid total of 100
  // and an Infinity discount produced a valid total of 0).
  var dRaw = +discount;
  if (!isFinite(dRaw)) return { valid: false, error: 'تخفیف باید عدد معتبر باشد.' };
  if (dRaw < 0) return { valid: false, error: 'تخفیف نمی‌تواند منفی باشد.' };
  // Compare the RAW discount with the subtotal BEFORE rounding:
  // rounding first would turn 100.4 into 100 and wrongly accept it
  // on a subtotal of 100 (Nola regression round 2). Exactly 100 on
  // a subtotal of 100 passes; 100.4 must show the discount error.
  if (dRaw > sum) return { valid: false, error: 'تخفیف نمی‌تواند بیشتر از جمع اقلام باشد.' };
  discount = Math.round(dRaw);
  var tr = +taxRate;
  if (!isFinite(tr) || tr < 0 || tr > 100) return { valid: false, error: 'نرخ مالیات باید بین ۰ تا ۱۰۰ باشد.' };
  var afterDiscount = sum - discount;
  var tax = Math.round(afterDiscount * (tr / 100));
  var total = afterDiscount + tax;
  if (!isFinite(total) || total > 999999999999999) return { valid: false, error: 'مبلغ نهایی خارج از محدوده پشتیبانی‌شده است.' };
  return { sum: sum, discount: discount, tax: tax, total: total, valid: true };
}

// ---- minimal Jalaali (for today's date on the invoice) ----
function _div(a, b) { return ~~(a / b); }
function _mod(a, b) { return a - ~~(a / b) * b; }
var _breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
function _jalCal(jy) {
  var bl = _breaks.length, gy = jy + 621, leapJ = -14, jp = _breaks[0], jm, jump, leap, leapG, march, n, i;
  for (i = 1; i < bl; i += 1) { jm = _breaks[i]; jump = jm - jp; if (jy < jm) break; leapJ += _div(jump, 33) * 8 + _div(_mod(jump, 33), 4); jp = jm; }
  n = jy - jp;
  leapJ += _div(n, 33) * 8 + _div(_mod(n, 33) + 3, 4);
  if (_mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  leapG = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150;
  march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + _div(jump + 4, 33) * 33;
  leap = _mod(_mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap: leap, gy: gy, march: march };
}
function _g2d(gy, gm, gd) {
  var d = _div((gy + _div(gm - 8, 6) + 100100) * 1461, 4) + _div(153 * _mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752;
}
function _d2g(jdn) {
  var j = 4 * jdn + 139361631;
  j = j + _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  var i = _div(_mod(j, 1461), 4) * 5 + 308;
  return { gy: _div(j, 1461) - 100100 + _div(8 - _mod(_div(i, 153), 12) - 1, 6), gm: _mod(_div(i, 153), 12) + 1, gd: _div(_mod(i, 153), 5) + 1 };
}
function _j2d(jy, jm, jd) { var r = _jalCal(jy); return _g2d(r.gy, 3, r.march) + (jm - 1) * 31 - _div(jm, 7) * (jm - 7) + jd - 1; }
function _d2j(jdn) {
  var gy = _d2g(jdn).gy, jy = gy - 621, r = _jalCal(jy), jdn1f = _g2d(gy, 3, r.march), k = jdn - jdn1f, jd, jm;
  if (k >= 0) {
    if (k <= 185) { return { jy: jy, jm: 1 + _div(k, 31), jd: _mod(k, 31) + 1 }; }
    k -= 186;
  } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  return { jy: jy, jm: 7 + _div(k, 30), jd: _mod(k, 30) + 1 };
}
var J_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
function todayJalaaliStr() {
  var n = new Date();
  var j = _d2j(_g2d(n.getFullYear(), n.getMonth() + 1, n.getDate()));
  return faNum(j.jd) + ' ' + J_MONTHS[j.jm - 1] + ' ' + faNum(j.jy);
}

if (typeof document !== 'undefined') {
  var tbody = document.getElementById('itemsBody');
  // Rows are built with DOM APIs (not innerHTML) so user-entered text
  // (descriptions, names) is always treated as text, never as HTML.
  function addRow(desc, qty, price) {
    var tr = document.createElement('tr');
    var tdDesc = document.createElement('td');
    tdDesc.setAttribute('data-label', 'شرح کالا / خدمت');
    var inDesc = document.createElement('input');
    inDesc.type = 'text'; inDesc.className = 'desc'; inDesc.placeholder = 'شرح';
    inDesc.value = desc || '';
    var spDesc = document.createElement('span'); spDesc.className = 'print-val desc-print';
    tdDesc.appendChild(inDesc); tdDesc.appendChild(spDesc); tr.appendChild(tdDesc);
    var tdQty = document.createElement('td');
    tdQty.setAttribute('data-label', 'تعداد');
    var inQty = document.createElement('input');
    inQty.type = 'number'; inQty.className = 'qty num'; inQty.min = '0';
    inQty.value = (qty == null ? 1 : qty);
    var spQty = document.createElement('span'); spQty.className = 'print-val qty-print';
    tdQty.appendChild(inQty); tdQty.appendChild(spQty); tr.appendChild(tdQty);
    var tdPrice = document.createElement('td');
    tdPrice.setAttribute('data-label', 'قیمت واحد (تومان)');
    var inPrice = document.createElement('input');
    inPrice.type = 'number'; inPrice.className = 'price num'; inPrice.min = '0'; inPrice.placeholder = '۰';
    inPrice.value = (price == null ? '' : price);
    var spPrice = document.createElement('span'); spPrice.className = 'print-val price-print';
    tdPrice.appendChild(inPrice); tdPrice.appendChild(spPrice); tr.appendChild(tdPrice);
    var tdAmt = document.createElement('td');
    tdAmt.setAttribute('data-label', 'مبلغ (تومان)');
    tdAmt.className = 'amount num'; tdAmt.textContent = '۰';
    tr.appendChild(tdAmt);
    var tdDel = document.createElement('td');
    tdDel.className = 'no-print';
    var delBtn = document.createElement('button');
    delBtn.className = 'btn-del'; delBtn.textContent = 'حذف';
    delBtn.addEventListener('click', function () { tr.remove(); recalc(); });
    tdDel.appendChild(delBtn); tr.appendChild(tdDel);
    tr.querySelectorAll('input').forEach(function (inp) { inp.addEventListener('input', recalc); });
    tbody.appendChild(tr);
  }
  function readItems() {
    var items = [];
    tbody.querySelectorAll('tr').forEach(function (tr) {
      items.push({
        desc: tr.querySelector('.desc').value,
        qty: +tr.querySelector('.qty').value || 0,
        price: +tr.querySelector('.price').value || 0
      });
    });
    return items;
  }
  // Print-only values: each header field has a companion span that shows
  // only the entered value in print (empty fields print nothing, never
  // their placeholder text). Synced on every edit and before printing.
  function syncHeaderPrint() {
    ['sellerName','sellerPhone','sellerAddr','buyerName','buyerPhone','buyerAddr','invNo'].forEach(function (id) {
      var s = document.querySelector('.print-val[data-for="' + id + '"]');
      if (s) s.textContent = document.getElementById(id).value;
    });
  }
  ['sellerName','sellerPhone','sellerAddr','buyerName','buyerPhone','buyerAddr','invNo'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', syncHeaderPrint);
  });
  window.addEventListener('beforeprint', function () { syncHeaderPrint(); recalc(); });
  function recalc() {
    var items = readItems();
    // Sync the row print-only values with the current inputs.
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var d = tr.querySelector('.desc-print'), q = tr.querySelector('.qty-print'), p = tr.querySelector('.price-print');
      if (d) d.textContent = tr.querySelector('.desc').value;
      if (q) q.textContent = tr.querySelector('.qty').value;
      if (p) p.textContent = tr.querySelector('.price').value;
    });
    syncHeaderPrint();
    // Raw values are passed through WITHOUT "|| 0": masking NaN to 0
    // would silently accept an invalid discount/tax rate (Nola found
    // a NaN discount producing a valid total). An empty field parses
    // to 0 on its own (+'' === 0), so nothing is lost.
    var discEl = document.getElementById('discount');
    var taxEl = document.getElementById('taxRate');
    var r = calcInvoice(items, +discEl.value, +taxEl.value);
    // Print-only values for discount / tax rate, same treatment as the
    // other editable fields: show the entered value when the invoice
    // is valid; print nothing when it is invalid (an invalid rate or
    // discount must never appear as if it were a real figure).
    // Blank vs explicitly entered zero: both calculate as zero, but
    // ONLY an entered zero populates its print span — a cleared
    // input leaves the span empty (Nola regression round 2).
    var dRaw = +discEl.value, tRaw = +taxEl.value;
    var discEntered = discEl.value.trim() !== '';
    var taxEntered = taxEl.value.trim() !== '';
    document.getElementById('discountPrint').textContent =
      (r.valid && discEntered) ? faNum(Math.round(dRaw).toLocaleString('en-US')) + ' تومان' : '';
    document.getElementById('taxPrint').textContent =
      (r.valid && taxEntered) ? faNum(tRaw) + '٪' : '';
    var errEl = document.getElementById('calcError');
    // Per-row amounts don't depend on the tax rate, so they always update.
    tbody.querySelectorAll('tr').forEach(function (tr, i) {
      var amt = Math.round(Math.max(0, items[i].qty) * Math.max(0, items[i].price));
      tr.querySelector('.amount').textContent = faNum(amt.toLocaleString('en-US'));
    });
    if (!r.valid) {
      errEl.textContent = r.error;
      errEl.style.display = 'block';
      taxEl.classList.toggle('invalid', /مالیات/.test(r.error));
      discEl.classList.toggle('invalid', /تخفیف/.test(r.error));
      document.getElementById('sumItems').textContent = '—';
      document.getElementById('taxAmount').textContent = '—';
      document.getElementById('grandTotal').textContent = '—';
      document.getElementById('wordsOut').textContent = r.error;
      return;
    }
    errEl.style.display = 'none';
    taxEl.classList.remove('invalid');
    discEl.classList.remove('invalid');
    document.getElementById('sumItems').textContent = faNum(r.sum.toLocaleString('en-US')) + ' تومان';
    document.getElementById('taxAmount').textContent = faNum(r.tax.toLocaleString('en-US')) + ' تومان';
    document.getElementById('grandTotal').textContent = faNum(r.total.toLocaleString('en-US')) + ' تومان';
    var w = toPersianWords(r.total);
    document.getElementById('wordsOut').textContent = w ? w + ' تومان' : 'مبلغ نهایی معتبر نیست.';
  }
  document.getElementById('addRowBtn').addEventListener('click', function () { addRow('', 1, ''); });
  document.getElementById('sampleBtn').addEventListener('click', function () {
    tbody.innerHTML = '';
    addRow('طراحی سایت تک‌صفحه‌ای', 1, 900000);
    addRow('اسکریپت پایتون اتوماسیون', 1, 750000);
    addRow('ترجمه تخصصی (۱۰ صفحه)', 1, 500000);
    recalc();
  });
  document.getElementById('discount').addEventListener('input', recalc);
  document.getElementById('taxRate').addEventListener('input', recalc);
  document.getElementById('printBtn').addEventListener('click', function () { window.print(); });
  document.getElementById('copyBtn').addEventListener('click', async function () {
    var t = document.getElementById('grandTotal').textContent;
    try { await navigator.clipboard.writeText(t); this.textContent = 'کپی شد ✓'; }
    catch (e) { this.textContent = 'کپی نشد'; }
    var self = this;
    setTimeout(function () { self.textContent = 'کپی مبلغ نهایی'; }, 2000);
  });
  document.getElementById('invDate').value = todayJalaaliStr();
  addRow('', 1, '');
  addRow('', 1, '');
  recalc();
}
