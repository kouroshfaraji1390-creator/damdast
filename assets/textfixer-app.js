
var ZWNJ = '‌';
// Spans that must never be touched: URLs, emails, backtick code.
// They are masked with private-use placeholders before fixing and restored after,
// so digits, dots and colons inside them are never rewritten.
function protectSpans(s) {
  var spans = [];
  s = s.replace(/(https?:\/\/[^\s]+|www\.[^\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|`[^`]*`)/g, function (m) {
    spans.push(m);
    return '' + String.fromCharCode(0xE000 + spans.length - 1) + '';
  });
  return { text: s, spans: spans };
}
function restoreSpans(s, spans) {
  return s.replace(/([\uE000-\uF8FF])/g, function (m, c) {
    return spans[c.charCodeAt(0) - 0xE000];
  });
}
function fixPersianText(text, opts) {
  opts = opts || {};
  var s = String(text == null ? '' : text);
  var prot = protectSpans(s);
  s = prot.text;
  if (opts.arabic !== false) {
    s = s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ة/g, 'ه').replace(/ى/g, 'ی');
  }
  if (opts.digits === 'fa') {
    s = s.replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; })
         .replace(/[٠-٩]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]; });
  } else if (opts.digits === 'en') {
    s = s.replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); })
         .replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
  }
  if (opts.zwnj !== false) {
    // NOTE: JS \b is ASCII-only, so Persian word boundaries use explicit classes.
    s = s.replace(/(^|[\s(«"'])(ن?می)\s+/g, '$1$2' + ZWNJ);
    s = s.replace(/([آ-ی])\s+(هایی|های|ها)(?![آ-ی])/g, '$1' + ZWNJ + '$2');
    s = s.replace(/([آ-ی])\s+(ترین|تر)(?![آ-ی])/g, '$1' + ZWNJ + '$2');
    s = s.replace(/([آ-ی])\s+(ایم|اید|اند|ام|ای)(?![آ-ی])/g, '$1' + ZWNJ + '$2');
  }
  if (opts.punct !== false) {
    s = s.replace(/\s+([،؛:.!؟?)\]}])/g, '$1');
    s = s.replace(/([آ-ی])\.\s*([آ-ی])/g, '$1. $2');
    s = s.replace(/([،؛!؟?])\s*([آ-یA-Za-z])/g, '$1 $2');
    // Colon spacing only in Persian context (leaves http://, 12:30, a:b untouched).
    s = s.replace(/([آ-ی]):([آ-یA-Za-z0-9])/g, '$1: $2');
    // Space before '(' only after a Persian letter (leaves f(x) / console.log(x) untouched).
    s = s.replace(/([آ-ی])\(/g, '$1 (');
    s = s.replace(/\(\s+/g, '(');
  }
  if (opts.spaces !== false) {
    s = s.split('\n').map(function (l) { return l.replace(/[^\S\n]+/g, ' ').trim(); }).join('\n');
    s = s.replace(/\n{3,}/g, '\n\n').trim();
  }
  return restoreSpans(s, prot.spans);
}

if (typeof document !== 'undefined') {
  var input = document.getElementById('inText');
  var out = document.getElementById('outText');
  var copyBtn = document.getElementById('copyBtn');
  var copyOrigBtn = document.getElementById('copyOrigBtn');
  var applyBtn = document.getElementById('applyBtn');
  var undoBtn = document.getElementById('undoBtn');
  var lastOriginal = null; // text before the last Apply, for Undo
  function opts() {
    return {
      zwnj: document.getElementById('optZwnj').checked,
      arabic: document.getElementById('optArabic').checked,
      punct: document.getElementById('optPunct').checked,
      spaces: document.getElementById('optSpaces').checked,
      digits: document.getElementById('optDigits').value
    };
  }
  function render() {
    var v = input.value;
    if (!v.trim()) {
      out.textContent = 'متن اصلاح‌شده اینجا نمایش داده می‌شود.';
      copyBtn.disabled = true; copyOrigBtn.disabled = true; applyBtn.disabled = true;
      return;
    }
    out.textContent = fixPersianText(v, opts());
    copyBtn.disabled = false; copyOrigBtn.disabled = false; applyBtn.disabled = false;
  }
  input.addEventListener('input', function () {
    // The user edited the text after an Apply: the preserved original no
    // longer applies, so Copy Original falls back to the current input.
    lastOriginal = null; undoBtn.disabled = true; render();
  });
  ['optZwnj', 'optArabic', 'optPunct', 'optSpaces', 'optDigits'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', render);
  });
  document.querySelectorAll('.chip[data-t]').forEach(function (b) {
    b.addEventListener('click', function () {
      // A sample replaces the whole draft: the preserved original from
      // a previous Apply no longer applies, so clear it (and disable
      // Undo) — otherwise Copy Original would copy a stale draft
      // (Nola regression).
      input.value = b.dataset.t; lastOriginal = null; undoBtn.disabled = true; render(); input.focus();
    });
  });
  document.getElementById('clearBtn').addEventListener('click', function () {
    input.value = ''; lastOriginal = null; undoBtn.disabled = true; render(); input.focus();
  });
  // Preview-and-accept: the original is never overwritten silently.
  // Apply replaces the input with the previewed text (Undo restores it).
  applyBtn.addEventListener('click', function () {
    lastOriginal = input.value;
    input.value = out.textContent;
    undoBtn.disabled = false;
    render(); input.focus();
  });
  undoBtn.addEventListener('click', function () {
    if (lastOriginal == null) return;
    input.value = lastOriginal;
    lastOriginal = null; undoBtn.disabled = true;
    render(); input.focus();
  });
  copyBtn.addEventListener('click', async function () {
    try { await navigator.clipboard.writeText(out.textContent); copyBtn.textContent = 'کپی شد ✓'; }
    catch (e) { copyBtn.textContent = 'کپی نشد — متن را انتخاب کنید'; }
    setTimeout(function () { copyBtn.textContent = 'کپی متن اصلاح‌شده'; }, 2000);
  });
  copyOrigBtn.addEventListener('click', async function () {
    // Copy the text as it was before the last Apply when one exists;
    // otherwise copy the current input.
    var t = (lastOriginal != null ? lastOriginal : input.value);
    try { await navigator.clipboard.writeText(t); copyOrigBtn.textContent = 'کپی شد ✓'; }
    catch (e) { copyOrigBtn.textContent = 'کپی نشد — متن را انتخاب کنید'; }
    setTimeout(function () { copyOrigBtn.textContent = 'کپی متن اصلی'; }, 2000);
  });
}
