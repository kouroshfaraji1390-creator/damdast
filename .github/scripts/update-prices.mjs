// دم‌دست — fetch live gold/coin/dollar prices from Nerkh (nerkh.io) and write
// data/prices.json for the homepage price strip.
//
// Runs in GitHub Actions (see .github/workflows/update-prices.yml).
// The token comes ONLY from the NERKH_TOKEN environment variable (a GitHub
// secret) and is never printed to the log.
//
// Endpoint (from public docs at https://docs.nerkh.io):
//   GET https://api.nerkh.io/v2/prices/json/lite
// The docs list the paths but not the auth scheme, so this script tries the
// three common ways of sending a token, in order, and remembers the one that
// works in .github/nerkh-auth-method.txt:
//   1. Authorization: Bearer <token>
//   2. X-API-Key: <token>
//   3. ?token=<token> query parameter
// A request with no token to this endpoint returns 401, which confirms the
// endpoint exists and requires authentication.
//
// The response shape is parsed defensively: the docs do not publish an
// example body, so the parser accepts an array, { data: [...] },
// { prices: [...] }, { items: [...] }, or an object keyed by symbol, and
// reads price/change from several common field names. If the shape is not
// recognised, the script fails loudly instead of writing wrong data.
//
// Prices are assumed to be in Toman. If the 18k gold value is above
// 100,000,000 the values are treated as Rial, divided by 10, and a warning
// is logged. Check the first run's log to confirm the unit.

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

// Extract a flat [{ symbol, price, change_pct }] list from an unknown shape.
function extractItems(json) {
  let arr = null;
  if (Array.isArray(json)) arr = json;
  else if (json && typeof json === 'object') {
    for (const key of ['data', 'prices', 'items', 'result']) {
      if (Array.isArray(json[key])) { arr = json[key]; break; }
    }
    if (!arr) {
      // Object keyed by symbol: { "GOLD18K": { "price": ... }, ... }
      const entries = Object.entries(json).filter(([, v]) => v && typeof v === 'object');
      if (entries.length > 0) arr = entries.map(([k, v]) => ({ symbol: k, ...v }));
    }
  }
  if (!arr) return null;
  const items = [];
  for (const raw of arr) {
    const symbol = String(pick(raw, ['symbol', 'code', 'key', 'name', 'id']) || '').toUpperCase();
    const price = toNumber(pick(raw, ['price', 'value', 'rate', 'current', 'price_toman', 'amount']));
    if (!symbol || price === undefined) continue;
    const change = toNumber(pick(raw, ['change_pct', 'change', 'change24h', 'percent', 'change_percent']));
    items.push({ symbol, price, change_pct: change });
  }
  return items;
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
