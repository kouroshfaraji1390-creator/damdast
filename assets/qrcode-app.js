
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

// Max data bytes in byte mode at version 40, per error-correction level.
var QR_MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 };
function faNum(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }); }
function utf8ByteLength(s) { return qrcode.stringToBytesFuncs['UTF-8'](s).length; }

function buildQRData(text, level) {
  var qr = qrcode(0, level);
  qr.addData(text);
  qr.make();
  return qr;
}
function drawQR(qr, size) {
  var n = qr.getModuleCount();
  var canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  var ctx = canvas.getContext('2d');
  var quiet = 4, cell = size / (n + quiet * 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  return canvas;
}

if (typeof document !== 'undefined') {
  var input = document.getElementById('qrText');
  var typeSel = document.getElementById('qrType');
  var levelSel = document.getElementById('qrLevel');
  var sizeSel = document.getElementById('qrSize');
  var box = document.getElementById('qrBox');
  var dlBtn = document.getElementById('dlBtn');
  var copyBtn = document.getElementById('copyBtn');
  var hint = document.getElementById('qrHint');
  var currentCanvas = null, currentText = '';

  function payload() {
    var t = input.value.trim();
    var type = typeSel.value;
    if (!t) return '';
    if (type === 'tel') return t.indexOf('tel:') === 0 ? t : 'tel:' + t.replace(/[\s-]/g, '');
    if (type === 'email') return t.indexOf('mailto:') === 0 ? t : 'mailto:' + t;
    if (type === 'url' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return 'https://' + t;
    return t;
  }
  function render() {
    var text = payload();
    if (!text) {
      box.innerHTML = '<div class="qr-empty">کد QR اینجا نمایش داده می‌شود.</div>';
      dlBtn.disabled = true; copyBtn.disabled = true; currentCanvas = null; currentText = '';
      hint.textContent = 'متن را بنویسید؛ کد QR به‌صورت خودکار ساخته می‌شود.';
      return;
    }
    // Readable Persian error when the text exceeds this level's capacity,
    // instead of a broken code or a raw library message.
    var maxBytes = QR_MAX_BYTES[levelSel.value];
    var nBytes = utf8ByteLength(text);
    if (nBytes > maxBytes) {
      box.innerHTML = '<div class="qr-empty">متن برای کد QR خیلی طولانی است — کوتاه‌ترش کنید یا سطح تصحیح خطا را کمتر کنید.</div>';
      dlBtn.disabled = true; copyBtn.disabled = true; currentCanvas = null; currentText = '';
      hint.textContent = 'متن شما ' + faNum(nBytes) + ' بایت است؛ ظرفیت سطح ' + levelSel.value + ' حداکثر ' + faNum(maxBytes) + ' بایت است.';
      return;
    }
    try {
      var qr = buildQRData(text, levelSel.value);
      currentCanvas = drawQR(qr, +sizeSel.value);
      box.innerHTML = '';
      box.appendChild(currentCanvas);
      currentText = text;
      dlBtn.disabled = false; copyBtn.disabled = false;
      hint.textContent = 'متن داخل کد: ' + (text.length > 60 ? text.slice(0, 60) + '…' : text);
    } catch (e) {
      box.innerHTML = '<div class="qr-empty">متن برای کد QR خیلی طولانی است — کوتاه‌ترش کنید یا سطح تصحیح خطا را کمتر کنید.</div>';
      dlBtn.disabled = true; copyBtn.disabled = true; currentCanvas = null; currentText = '';
      hint.textContent = 'ساخت کد ممکن نشد — متن را کوتاه‌تر کنید.';
    }
  }
  input.addEventListener('input', render);
  typeSel.addEventListener('change', render);
  levelSel.addEventListener('change', render);
  sizeSel.addEventListener('change', render);
  document.querySelectorAll('.chip[data-t]').forEach(function (b) {
    b.addEventListener('click', function () { input.value = b.dataset.t; render(); input.focus(); });
  });
  dlBtn.addEventListener('click', function () {
    if (!currentCanvas) return;
    var a = document.createElement('a');
    a.download = 'qrcode.png';
    a.href = currentCanvas.toDataURL('image/png');
    a.click();
  });
  copyBtn.addEventListener('click', async function () {
    try { await navigator.clipboard.writeText(currentText || input.value); copyBtn.textContent = 'کپی شد ✓'; }
    catch (e) { copyBtn.textContent = 'کپی نشد — متن را انتخاب کنید'; }
    setTimeout(function () { copyBtn.textContent = 'کپی متن'; }, 2000);
  });
}
