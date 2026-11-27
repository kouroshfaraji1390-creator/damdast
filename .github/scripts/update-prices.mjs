// دم‌دست — fetch live gold/coin/dollar prices from Nerkh (nerkh.io) and write
// data/prices.json for the homepage price strip.
//
// Runs in GitHub Actions (see .github/workflows/update-prices.yml).
// The token comes ONLY from the NERKH_TOKEN environment variable (a GitHub
// secret) and is never printed to the log.
//
// Endpoint (from public docs at https://docs.nerkh.io):
//   GET https://api.nerkh.io/v2/prices/json/lite
// Auth scheme PROVEN by workflow run #1 (2026-11-27): Authorization: Bearer
// <token> works ("OK with method: bearer"); the other two methods stay as
// fallbacks, and the working one is remembered in
// .github/nerkh-auth-method.txt. A request with no token to this endpoint
// returns 401, which confirms the endpoint exists and requires authentication.
//
// Response shape PROVEN by run #1: the body is
//   { "data": { "message": "Success", "status": 200, "count": 43,
//               "gold": { "GOLD18K": { "current": "25940500", ... }, ... },
//               "currency": { "USD": { "current": "...", ... }, ... }, ... } }
// i.e. data is an object of groups (gold, currency, crypto, ...), each group
// an object keyed by symbol, each symbol an object with a "current" price
// field (string) and change fields. The parser walks the whole tree and
// collects every object that carries a price field, so it also accepts a
// top-level array or { data/prices/items/result: [...] } shape. If the shape
// is not recognised, the script fails loudly instead of writing wrong data.
//
// Prices are in Toman — PROVEN by run #1 (GOLD18K = 25,940,500, far below
// the 100,000,000 Rial threshold). The /10 guard below stays as a safety net:
// if 18k gold ever comes back above 100,000,000, the values are treated as
// Rial and divided by 10, with a warning logged.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const API_URL = process.env.NERKH_API_URL || 'https://api.nerkh.io/v2/prices/json/lite';
const TOKEN = process.env.NERKH_TOKEN;
const METHOD_FILE = '.github/nerkh-auth-method.txt';
const OUT_FILE = 'data/prices.json';

if (!TOKEN) {
  console.error('ERROR: NERKH_TOKEN environment variable is not set.');
  process.exit(1);
}

const METHODS = ['bearer', 'x-api-key', 'query'];

function pinnedMethod() {
  try {
    if (existsSync(METHOD_FILE)) {
      const m = readFileSync(METHOD_FILE, 'utf8').trim();
      if (METHODS.includes(m)) return m;
    }
  } catch { /* fall through to default */ }
  return 'bearer';
}

function buildRequest(method) {
  if (method === 'bearer') {
    return { url: API_URL, headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } };
  }
  if (method === 'x-api-key') {
    return { url: API_URL, headers: { 'X-API-Key': TOKEN, Accept: 'application/json' } };
  }
  const sep = API_URL.includes('?') ? '&' : '?';
  return { url: `${API_URL}${sep}token=${encodeURIComponent(TOKEN)}`, headers: { Accept: 'application/json' } };
}

async function tryFetch(method) {
  const { url, headers } = buildRequest(method);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  return { status: res.status, text };
}

function pick(obj, names) {
  for (const n of names) {
    if (obj && obj[n] !== undefined && obj[n] !== null) return obj[n];
  }
  return undefined;
}

function toNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,\s٬]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// Prefer an explicitly percent-named field; a bare "change" is only trusted
// as a percent when it is small (|x| <= 100) — a real daily percent move.
// (A large bare "change" would be an absolute Toman amount, not a percent.)
function pickChange(v) {
  const pct = toNumber(pick(v, ['change_pct', 'change_percent', 'percent', 'change24h_pct', 'change_percentage']));
  if (pct !== undefined) return pct;
  const c = toNumber(pick(v, ['change', 'change24h']));
  if (c !== undefined && Math.abs(c) <= 100) return c;
  return undefined;
}

// Extract a flat [{ symbol, price, change_pct }] list from an unknown shape.
// Walks the whole tree and collects every object that carries a price field:
//   - keyed by symbol: { "gold": { "GOLD18K": { "current": "25940500" } } }
//   - array items with an explicit symbol field: [{ "symbol": "USD", "price": 1 }]
function extractItems(json) {
  const found = [];
  const seen = new Set();
  function collect(symbol, obj) {
    const s = String(symbol).toUpperCase();
    if (seen.has(s)) return;
    seen.add(s);
    found.push({ symbol: s, price: toNumber(pick(obj, ['current', 'price', 'value', 'rate', 'price_toman', 'amount'])), change_pct: pickChange(obj) });
  }
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const el of node) walk(el); return; }
    // An object that carries its own symbol + price fields (array-item shape).
    const ownSymbol = pick(node, ['symbol', 'code', 'key', 'name', 'id']);
    const ownPrice = toNumber(pick(node, ['current', 'price', 'value', 'rate', 'price_toman', 'amount']));
    if (ownSymbol !== undefined && ownPrice !== undefined) { collect(ownSymbol, node); return; }
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const price = toNumber(pick(v, ['current', 'price', 'value', 'rate', 'price_toman', 'amount']));
        if (price !== undefined) { collect(k, v); continue; } // a symbol entry
        walk(v); // a group (gold, currency, ...) — descend
      } else if (Array.isArray(v)) {
        walk(v);
      }
    }
  }
  walk(json);
  return found.length ? found : null;
}

// Persian labels for the symbols the homepage strip shows.
const LABELS = {
  GOLD18K: 'طلای ۱۸ عیار (گرم)',
  SEKE_EMAMI: 'سکه امامی',
  SEKE_BAHAR: 'سکه بهار آزادی',
  SEKE_NIM: 'نیم‌سکه',
  SEKE_ROB: 'ربع‌سکه',
  USD: 'دلار آمریکا',
  EUR: 'یورو',
};
const WANTED = Object.keys(LABELS);

function jalaliNowFa() {
  const fmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return fmt.format(new Date());
}

const pinned = pinnedMethod();
const order = [pinned, ...METHODS.filter((m) => m !== pinned)];
let workingMethod = null;
let payload = null;
for (const method of order) {
  console.log(`Trying auth method: ${method}`);
  let r;
  try {
    r = await tryFetch(method);
  } catch (e) {
    console.log(`  request failed: ${e.message}`);
    continue;
  }
  if (r.status === 200) {
    try {
      payload = JSON.parse(r.text);
    } catch {
      console.log('  200 but body is not JSON — aborting.');
      process.exit(1);
    }
    workingMethod = method;
    console.log(`  OK with method: ${method}`);
    break;
  }
  console.log(`  HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  if (r.status !== 401 && r.status !== 403) {
    console.error(`ERROR: Nerkh API returned HTTP ${r.status}. Body (first 500 chars): ${r.text.slice(0, 500)}`);
    process.exit(1);
  }
  // 401/403: wrong auth method (or token/plan problem) — try the next method.
}
if (!workingMethod) {
  console.error('ERROR: all auth methods failed (401/403). Check that NERKH_TOKEN is the active free monthly token from the Nerkh panel (cp.nerkh.io) and that the token covers the /v2/prices/json/lite endpoint. Also confirm the auth scheme in the Nerkh docs or panel.');
  process.exit(1);
}

if (workingMethod !== pinned) {
  mkdirSync('.github', { recursive: true });
  writeFileSync(METHOD_FILE, workingMethod + '\n');
  console.log(`Pinned auth method "${workingMethod}" in ${METHOD_FILE}.`);
} else {
  // Record the proven method even when it equals the default pin: the
  // workflow's commit step adds this file, and a missing file used to break
  // `git add` (run #2, 2026-11-27) and lose an otherwise good price fetch.
  mkdirSync('.github', { recursive: true });
  writeFileSync(METHOD_FILE, workingMethod + '\n');
  console.log(`Auth method "${workingMethod}" recorded in ${METHOD_FILE}.`);
}

const extracted = extractItems(payload);
if (!extracted || extracted.length === 0) {
  console.error('ERROR: could not recognise the Nerkh response shape. Raw body (first 1000 chars):', JSON.stringify(payload).slice(0, 1000));
  process.exit(1);
}
console.log('Raw items received:', extracted.map((i) => `${i.symbol}=${i.price}`).join(', '));

const bySymbol = new Map(extracted.map((i) => [i.symbol, i]));
const items = [];
for (const sym of WANTED) {
  const it = bySymbol.get(sym);
  if (!it) { console.log(`Symbol ${sym} missing from response — skipped.`); continue; }
  items.push({ label: LABELS[sym], value: Math.round(it.price), unit: 'تومان', ...(typeof it.change_pct === 'number' ? { change_pct: Math.round(it.change_pct * 100) / 100 } : {}) });
}
if (items.length === 0) {
  console.error('ERROR: none of the wanted symbols were in the response.');
  process.exit(1);
}

// Unit sanity check: 18k gold per gram in Toman is far below 100,000,000.
// If it is above that, the API almost certainly returned Rial — divide by 10.
const gold = items.find((i) => i.label === LABELS.GOLD18K);
if (gold && gold.value > 100000000) {
  console.log(`WARNING: gold 18k value ${gold.value} looks like Rial, not Toman — dividing all values by 10. Verify the unit in the log.`);
  for (const it of items) it.value = Math.round(it.value / 10);
}

const out = {
  items,
  source: 'نرخ — nerkh.io',
  source_url: 'https://nerkh.io',
  updated_at: jalaliNowFa(),
  updated_at_iso: new Date().toISOString(),
};
mkdirSync('data', { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${OUT_FILE} with ${items.length} items:`, items.map((i) => `${i.label}=${i.value}`).join(', '));
