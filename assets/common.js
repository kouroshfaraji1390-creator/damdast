/* دم‌دست — shared helpers: Persian digits, copy/share, Jalaali conversion.
   Jalaali algorithm: standard jalaali-js, verified vs jdatetime. */
function faNum(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }); }
function faMoney(n) {
  var s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return s.replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
}
function toFaDigits(s) { return String(s).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }); }
function parseFaNum(s) {
  if (s === null || s === undefined) return NaN;
  return Number(String(s).trim()
    .replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); })
    .replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
    .replace(/[,\s٬]/g, ''));
}
function copyText(text, btn, doneLabel) {
  function done() {
    if (!btn) return;
    var old = btn.textContent;
    btn.textContent = doneLabel || 'کپی شد ✓';
    setTimeout(function () { btn.textContent = old; }, 2000);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
  } else { fallbackCopy(text); done(); }
}
function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}
function shareText(text, btn) {
  if (navigator.share) {
    navigator.share({ text: text }).catch(function () {});
  } else { copyText(text, btn, 'کپی شد — حالا به اشتراک بگذارید'); }
}

/* ---- Jalaali conversion (jalaali-js algorithm) ---- */
function _div(a, b) { return ~~(a / b); }
function _mod(a, b) { return a - ~~(a / b) * b; }
var _breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
function jalCal(jy) {
  var bl = _breaks.length, gy = jy + 621, leapJ = -14, jp = _breaks[0], jm, jump, leap, leapG, march, n, i;
  if (jy < jp || jy >= _breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy);
  for (i = 1; i < bl; i += 1) {
    jm = _breaks[i]; jump = jm - jp;
    if (jy < jm) break;
    leapJ += _div(jump, 33) * 8 + _div(_mod(jump, 33), 4);
    jp = jm;
  }
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
function g2d(gy, gm, gd) {
  var d = _div((gy + _div(gm - 8, 6) + 100100) * 1461, 4) + _div(153 * _mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn) {
  var j = 4 * jdn + 139361631;
  j = j + _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  var i = _div(_mod(j, 1461), 4) * 5 + 308;
  var gd = _div(_mod(i, 153), 5) + 1;
  var gm = _mod(_div(i, 153), 12) + 1;
  var gy = _div(j, 1461) - 100100 + _div(8 - gm, 6);
  return { gy: gy, gm: gm, gd: gd };
}
function j2d(jy, jm, jd) {
  var r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - _div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn) {
  var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy), jdn1f = g2d(gy, 3, r.march), jd, jm, k;
  k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) { jm = 1 + _div(k, 31); jd = _mod(k, 31) + 1; return { jy: jy, jm: jm, jd: jd }; }
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + _div(k, 30); jd = _mod(k, 30) + 1;
  return { jy: jy, jm: jm, jd: jd };
}
function toJalaali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }
function isLeapJalaaliYear(jy) { return jalCal(jy).leap === 0; }
function jalaaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaaliYear(jy) ? 30 : 29;
}
function gregorianMonthLength(gy, gm) { return new Date(gy, gm, 0).getDate(); }
var J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
var G_MONTHS = ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'];
var WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
function weekdayFa(gy, gm, gd) { return WEEKDAYS_FA[new Date(gy, gm - 1, gd).getDay()]; }
function validJalaali(jy, jm, jd) {
  return Number.isInteger(jy) && jy >= 1200 && jy <= 1600 && Number.isInteger(jm) && jm >= 1 && jm <= 12 && Number.isInteger(jd) && jd >= 1 && jd <= jalaaliMonthLength(jy, jm);
}
function validGregorian(gy, gm, gd) {
  return Number.isInteger(gy) && gy >= 1900 && gy <= 2200 && Number.isInteger(gm) && gm >= 1 && gm <= 12 && Number.isInteger(gd) && gd >= 1 && gd <= gregorianMonthLength(gy, gm);
}
function todayJalaali() {
  var n = new Date();
  return toJalaali(n.getFullYear(), n.getMonth() + 1, n.getDate());
}
