/* اوقات شرعی — محاسبه نجومی موقعیت خورشید.
   روش: مؤسسه ژئوفیزیک دانشگاه تهران (همان روشی که بیشتر مساجد ایران و تقویم رسمی استفاده می‌کنند):
   فجر ۱۷٫۷ درجه زیر افق، عشاء ۱۴ درجه، مغرب ۴٫۵ درجه، عصر به روش استاندارد، نیمه‌شب به روش جعفری.
   منبع پارامترها: praytimes.org (روش Tehran) و مستندات PrayTimes.
   زمان‌ها تقریبی‌اند و ممکن است چند دقیقه با اوقات شرعی رسمی اعلام‌شده تفاوت داشته باشند.
   ساعت رسمی ایران UTC+3:30 در نظر گرفته شده است (از سال ۱۴۰۱ تغییر ساعت تابستانی در ایران اعمال نمی‌شود). */
var IRAN_TZ = 3.5;

function _dtr(d) { return (d * Math.PI) / 180; }
function _rtd(r) { return (r * 180) / Math.PI; }
function _sin(d) { return Math.sin(_dtr(d)); }
function _cos(d) { return Math.cos(_dtr(d)); }
function _tan(d) { return Math.tan(_dtr(d)); }
function _arcsin(x) { return _rtd(Math.asin(x)); }
function _arccos(x) { return _rtd(Math.acos(x)); }
function _arctan2(y, x) { return _rtd(Math.atan2(y, x)); }
function _arccot(x) { return _rtd(Math.atan(1 / x)); }
function _fixAngle(a) { return a - 360 * Math.floor(a / 360); }
function _fixHour(h) { return h - 24 * Math.floor(h / 24); }

function julianDay(year, month, day) {
  if (month <= 2) { year -= 1; month += 12; }
  var A = Math.floor(year / 100);
  var B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

function sunPosition(jd) {
  var D = jd - 2451545.0;
  var g = _fixAngle(357.529 + 0.98560028 * D);
  var q = _fixAngle(280.459 + 0.98564736 * D);
  var L = _fixAngle(q + 1.915 * _sin(g) + 0.020 * _sin(2 * g));
  var e = 23.439 - 0.00000036 * D;
  var RA = _fixHour(_arctan2(_cos(e) * _sin(L), _cos(L)) / 15);
  var eqt = q / 15 - RA;
  var decl = _arcsin(_sin(e) * _sin(L));
  return { declination: decl, equation: eqt };
}

function sunAngleTime(angle, lat, decl, dhuhr, direction) {
  // direction: -1 = before noon (fajr, sunrise), +1 = after noon
  var t = (1 / 15) * _arccos((-_sin(angle) - _sin(lat) * _sin(decl)) / (_cos(lat) * _cos(decl)));
  return dhuhr + direction * t;
}

function asrTime(lat, decl, dhuhr, step) {
  var angle = -_arccot(step + _tan(Math.abs(lat - decl)));
  return sunAngleTime(angle, lat, decl, dhuhr, 1);
}

/* Compute prayer times for one Gregorian date and one location.
   lat, lng: degrees. elev: city elevation in metres (approximate city-centre value);
   it corrects sunrise/sunset for horizon dip — without it, sunrise reads ~7 min late
   in high cities like Tehran (verified vs emrooz.app: 06:46 with correction vs 06:45).
   Returns { fajr, sunrise, dhuhr, asr, maghrib, isha, midnight } as "HH:MM" strings. */
function _dipDeg(h) { var R = 6371000; return _rtd(Math.acos(R / (R + h))); }
function computePrayerTimes(year, month, day, lat, lng, elev) {
  elev = elev || 0;
  var dip = _dipDeg(elev);
  var jd = julianDay(year, month, day);
  var sun = sunPosition(jd);
  var dhuhr = 12 + IRAN_TZ - lng / 15 - sun.equation;
  var fajr = sunAngleTime(17.7, lat, sun.declination, dhuhr, -1);
  var sunrise = sunAngleTime(0.833 + dip, lat, sun.declination, dhuhr, -1);
  var asr = asrTime(lat, sun.declination, dhuhr, 1);
  var maghrib = sunAngleTime(4.5, lat, sun.declination, dhuhr, 1);
  var isha = sunAngleTime(14, lat, sun.declination, dhuhr, 1);
  // Jafari midnight: midpoint between sunset and next day's fajr
  var jdNext = jd + 1;
  var sunNext = sunPosition(jdNext);
  var dhuhrNext = 12 + IRAN_TZ - lng / 15 - sunNext.equation;
  var fajrNext = sunAngleTime(17.7, lat, sunNext.declination, dhuhrNext, -1) + 24;
  var sunset = sunAngleTime(0.833 + dip, lat, sun.declination, dhuhr, 1);
  var midnight = _fixHour((sunset + fajrNext) / 2);
  function fmt(h) {
    h = _fixHour(h + 0.5 / 60); // round to nearest minute
    var hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  return {
    fajr: fmt(fajr), sunrise: fmt(sunrise), dhuhr: fmt(dhuhr), asr: fmt(asr),
    maghrib: fmt(maghrib), isha: fmt(isha), midnight: fmt(midnight)
  };
}

/* ---- Tabular (Kuwaiti) Islamic calendar — fallback when Intl islamic calendar is unavailable.
   This is an arithmetic calendar; the official Iranian lunar calendar follows moon sighting
   and may differ by about a day. ---- */
var HI_MONTHS = ['محرم', 'صفر', 'ربیع‌الاول', 'ربیع‌الثانی', 'جمادی‌الاول', 'جمادی‌الثانی', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذی‌القعده', 'ذی‌الحجه'];
function islamicToJD(y, m, d) {
  return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948439.5 - 1;
}
function jdToIslamic(jd) {
  jd = Math.floor(jd) + 0.5;
  var y = Math.floor((30 * (jd - 1948439.5) + 10646) / 10631);
  var m = Math.min(12, Math.ceil((jd - (29 + islamicToJD(y, 1, 1))) / 29.5) + 1);
  var d = jd - islamicToJD(y, m, 1) + 1;
  return { y: y, m: m, d: Math.floor(d) };
}
/* Hijri date (tabular) for a Julian day number. */
function hijriFromJD(jdn) {
  var h = jdToIslamic(jdn);
  return { y: h.y, m: h.m, d: h.d, monthName: HI_MONTHS[h.m - 1] };
}
