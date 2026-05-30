# Intel-Driven, Market-Aware Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace STRATWATCH's `web_search`-driven runner with a cheaper pipeline that scrapes four free intel sources (Drudge, PizzINT, GDELT, Kalshi), reasons over them with tiered models, and dynamically surfaces favorable Kalshi contracts.

**Architecture:** A new Step 0 collects four sources into one shared, prompt-cached `CONTEXT` string. Four Claude calls (Sonnet for situation + market-edge, Haiku for signals + watch) read that context with no web search. Step 4 lets Sonnet pick the most relevant live Kalshi markets, assigns STRATWATCH probabilities, and the code computes the gap vs market price and a favorable-contract flag. Output JSON keeps its existing shape (additive fields only) so the frontend is untouched.

**Tech Stack:** Node 20 (CommonJS), `node-fetch@2` (already a dep), Node's built-in `node:test` runner (no new deps), Anthropic Messages API with prompt caching.

**Design spec:** `docs/superpowers/specs/2026-05-29-scraped-context-pipeline-design.md`

---

## File Structure

```
scripts/
  run.js                  # orchestrator: Steps 0-4, writes docs/intelligence.json (REWRITTEN)
  lib/
    http.js               # httpGet() — node-fetch wrapper w/ browser UA + timeout
    claude.js             # callClaude(), parseJSON(), stripCites(), extractText()
    context.js            # buildContext() — assembles + truncates the shared CONTEXT
    edge.js               # computeGap(), isFavorable() — market-edge math
  sources/
    drudge.js             # extractHeadlines(), fetchDrudge()
    pizzint.js            # parseOsintFeed(), parseDoughcon(), fetchPizzint()
    gdelt.js              # THEATER_QUERIES, normalizeArticles(), fetchGdelt()
    kalshi.js             # parseFp(), marketFields(), filterRelevant(), flatten(),
                          # rankMarkets(), fetchKalshiCatalog(), auth stubs
  test/
    fixtures/             # captured live payloads (already created)
      pizzint.html, drudge.html, gdelt-europe.json, kalshi-events.json
    *.test.js             # node:test unit tests per pure module
  package.json            # add "test" script (MODIFY)
.github/workflows/intelligence.yml  # add KALSHI_API_KEY secret passthrough (MODIFY)
```

**Constants (shared, define once where first used, import elsewhere):**
- `SONNET = "claude-sonnet-4-6"`, `HAIKU = "claude-haiku-4-5-20251001"` (in `lib/claude.js`)
- `BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"` (in `lib/http.js`)
- `RELEVANT_CATEGORIES = ["World","Politics","Elections","Economics","Financials"]` (in `sources/kalshi.js`)

---

## Task 0: Test harness + HTTP utility

**Files:**
- Modify: `scripts/package.json`
- Create: `scripts/lib/http.js`
- Create: `scripts/test/http.test.js`

- [ ] **Step 1: Add the test script**

Edit `scripts/package.json` so `scripts` becomes:

```json
  "scripts": {
    "test": "node --test",
    "start": "node run.js"
  },
```

- [ ] **Step 2: Write the failing test**

Create `scripts/test/http.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { BROWSER_UA, httpGet } = require("../lib/http");

test("exports a browser User-Agent string", () => {
  assert.match(BROWSER_UA, /Mozilla\/5\.0/);
});

test("httpGet is a function", () => {
  assert.strictEqual(typeof httpGet, "function");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd scripts && node --test test/http.test.js`
Expected: FAIL — `Cannot find module '../lib/http'`

- [ ] **Step 4: Implement `lib/http.js`**

```js
// Shared HTTP helper. node-fetch v2 supports a `timeout` option natively.
const fetch = require("node-fetch");

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// GET a URL with a browser UA. Returns parsed JSON when json=true, else text.
async function httpGet(url, { json = false, timeoutMs = 15000, headers = {} } = {}) {
  const res = await fetch(url, {
    timeout: timeoutMs,
    headers: { "User-Agent": BROWSER_UA, Accept: json ? "application/json" : "*/*", ...headers },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return json ? res.json() : res.text();
}

module.exports = { BROWSER_UA, httpGet };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scripts && node --test test/http.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add scripts/package.json scripts/lib/http.js scripts/test/http.test.js
git commit -m "feat: add test harness and shared http utility"
```

---

## Task 1: Kalshi number parsing + per-market field extraction

**Files:**
- Create: `scripts/sources/kalshi.js`
- Create: `scripts/test/kalshi.test.js`

- [ ] **Step 1: Write the failing test**

Create `scripts/test/kalshi.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { parseFp, marketFields } = require("../sources/kalshi");

test("parseFp handles fixed-point strings, dollars, nulls", () => {
  assert.strictEqual(parseFp("33033.77"), 33033.77);
  assert.strictEqual(parseFp("0.0900"), 0.09);
  assert.strictEqual(parseFp(null), null);
  assert.strictEqual(parseFp(undefined), null);
  assert.strictEqual(parseFp("garbage"), null);
});

test("marketFields derives price (cents), 24h change, volume, OI", () => {
  const raw = {
    ticker: "KXELONMARS-99",
    title: "Will Elon Musk visit Mars in his lifetime?",
    yes_sub_title: "Mars",
    last_price_dollars: "0.0900",
    previous_price_dollars: "0.1400",
    volume_24h_fp: "69.00",
    open_interest_fp: "33033.77",
    liquidity_dollars: "120.5000",
  };
  const f = marketFields(raw, { category: "World", eventTicker: "KXELONMARS" });
  assert.strictEqual(f.ticker, "KXELONMARS-99");
  assert.strictEqual(f.marketProb, 9); // round(0.09 * 100)
  assert.strictEqual(f.priceChange24h, -5); // round((0.09 - 0.14) * 100)
  assert.strictEqual(f.volume24h, 69);
  assert.strictEqual(f.openInterest, 33034); // rounded
  assert.strictEqual(f.category, "World");
  assert.match(f.url, /kalshi\.com/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && node --test test/kalshi.test.js`
Expected: FAIL — `Cannot find module '../sources/kalshi'`

- [ ] **Step 3: Implement parsing in `sources/kalshi.js`**

```js
const { httpGet } = require("../lib/http");

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const RELEVANT_CATEGORIES = ["World", "Politics", "Elections", "Economics", "Financials"];

// Kalshi numeric fields arrive as strings ("_fp" fixed-point or "_dollars"). Parse defensively.
function parseFp(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Normalize one raw Kalshi market into the fields STRATWATCH uses.
function marketFields(m, { category = null, eventTicker = null } = {}) {
  const last = parseFp(m.last_price_dollars);
  const prev = parseFp(m.previous_price_dollars);
  const title = [m.title, m.yes_sub_title].filter(Boolean).join(" — ");
  return {
    ticker: m.ticker,
    title,
    marketProb: last === null ? null : Math.round(last * 100), // 0-100 like Polymarket marketProb
    priceChange24h: last === null || prev === null ? null : Math.round((last - prev) * 100), // cents
    volume24h: Math.round(parseFp(m.volume_24h_fp) ?? 0),
    openInterest: Math.round(parseFp(m.open_interest_fp) ?? 0),
    liquidity: parseFp(m.liquidity_dollars),
    category,
    eventTicker,
    url: `https://kalshi.com/markets/${m.ticker}`,
  };
}

module.exports = { KALSHI_BASE, RELEVANT_CATEGORIES, parseFp, marketFields };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && node --test test/kalshi.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/sources/kalshi.js scripts/test/kalshi.test.js
git commit -m "feat: kalshi field parsing (parseFp, marketFields)"
```

---

## Task 2: Kalshi catalog filtering, flattening, ranking

**Files:**
- Modify: `scripts/sources/kalshi.js`
- Modify: `scripts/test/kalshi.test.js`

- [ ] **Step 1: Add failing tests**

Append to `scripts/test/kalshi.test.js`:

```js
const { filterRelevant, flatten, rankMarkets } = require("../sources/kalshi");

const SAMPLE_EVENTS = [
  { event_ticker: "E1", category: "World", title: "Russia", markets: [
    { ticker: "E1-A", last_price_dollars: "0.50", previous_price_dollars: "0.40", volume_24h_fp: "1000", open_interest_fp: "5000" },
  ]},
  { event_ticker: "E2", category: "Sports", title: "NBA", markets: [
    { ticker: "E2-A", last_price_dollars: "0.50", previous_price_dollars: "0.50", volume_24h_fp: "999999", open_interest_fp: "1" },
  ]},
  { event_ticker: "E3", category: "Politics", title: "Election", markets: [
    { ticker: "E3-A", last_price_dollars: "0.20", previous_price_dollars: "0.20", volume_24h_fp: "0", open_interest_fp: "0" },
    { ticker: "E3-B", last_price_dollars: "0.30", previous_price_dollars: "0.10", volume_24h_fp: "500", open_interest_fp: "200" },
  ]},
];

test("filterRelevant drops non-geopolitical categories", () => {
  const rel = filterRelevant(SAMPLE_EVENTS);
  assert.deepStrictEqual(rel.map(e => e.event_ticker), ["E1", "E3"]);
});

test("flatten attaches category/event and normalizes each market", () => {
  const flat = flatten(filterRelevant(SAMPLE_EVENTS));
  assert.strictEqual(flat.length, 3); // E1-A, E3-A, E3-B
  assert.strictEqual(flat[0].category, "World");
  assert.strictEqual(flat[0].eventTicker, "E1");
});

test("rankMarkets drops inactive, sorts by volume desc, caps", () => {
  const ranked = rankMarkets(flatten(filterRelevant(SAMPLE_EVENTS)), { cap: 5 });
  // E3-A has 0 volume AND 0 OI -> dropped; E1-A(1000) before E3-B(500)
  assert.deepStrictEqual(ranked.map(m => m.ticker), ["E1-A", "E3-B"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && node --test test/kalshi.test.js`
Expected: FAIL — `filterRelevant is not a function`

- [ ] **Step 3: Implement in `sources/kalshi.js`**

Add before `module.exports` and extend the exports:

```js
function filterRelevant(events) {
  return (events || []).filter((e) => RELEVANT_CATEGORIES.includes(e.category));
}

function flatten(events) {
  const out = [];
  for (const e of events || []) {
    for (const m of e.markets || []) {
      out.push(marketFields(m, { category: e.category, eventTicker: e.event_ticker }));
    }
  }
  return out;
}

// Drop fully-inactive markets (no volume and no open interest), sort by 24h volume, cap.
function rankMarkets(markets, { cap = 50 } = {}) {
  return (markets || [])
    .filter((m) => (m.volume24h || 0) > 0 || (m.openInterest || 0) > 0)
    .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    .slice(0, cap);
}
```

Update exports:

```js
module.exports = { KALSHI_BASE, RELEVANT_CATEGORIES, parseFp, marketFields, filterRelevant, flatten, rankMarkets };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && node --test test/kalshi.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/sources/kalshi.js scripts/test/kalshi.test.js
git commit -m "feat: kalshi catalog filter/flatten/rank"
```

---

## Task 3: Kalshi catalog fetch (paginated) + auth stubs

**Files:**
- Modify: `scripts/sources/kalshi.js`
- Modify: `scripts/test/kalshi.test.js`

- [ ] **Step 1: Add a fixture-backed test**

Append to `scripts/test/kalshi.test.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { catalogFromEvents, fetchPositions } = require("../sources/kalshi");

test("catalogFromEvents builds a ranked catalog from a live fixture", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/kalshi-events.json"), "utf8"));
  const catalog = catalogFromEvents(raw.events, { cap: 50 });
  assert.ok(catalog.length > 0, "expected some relevant markets in fixture");
  for (const m of catalog) {
    assert.ok(RELEVANT_CATEGORIES.includes(m.category));
    assert.ok(typeof m.ticker === "string");
  }
});

test("authenticated endpoints are stubbed until later", () => {
  assert.throws(() => fetchPositions(), /not implemented/i);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && node --test test/kalshi.test.js`
Expected: FAIL — `catalogFromEvents is not a function`

- [ ] **Step 3: Implement fetch + pagination + stubs in `sources/kalshi.js`**

Add:

```js
// Pure: events array -> ranked catalog (used by both fetch and tests).
function catalogFromEvents(events, { cap = 50 } = {}) {
  return rankMarkets(flatten(filterRelevant(events)), { cap });
}

// Network: paginate open events with nested markets, then build the catalog.
async function fetchKalshiCatalog({ cap = 50, maxPages = 6 } = {}) {
  let cursor = "";
  let events = [];
  for (let i = 0; i < maxPages; i++) {
    const url =
      `${KALSHI_BASE}/events?limit=200&status=open&with_nested_markets=true` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const data = await httpGet(url, { json: true });
    events = events.concat(data.events || []);
    cursor = data.cursor;
    if (!cursor) break;
  }
  return catalogFromEvents(events, { cap });
}

// --- Authenticated (FUTURE SEAM — weather-engine integration). Not used yet. ---
function fetchPositions() {
  throw new Error("Kalshi authenticated endpoints not implemented yet");
}
function placeOrder() {
  throw new Error("Kalshi authenticated endpoints not implemented yet");
}
```

Update exports to add `catalogFromEvents, fetchKalshiCatalog, fetchPositions, placeOrder`.

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && node --test test/kalshi.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Live smoke test (manual, network)**

Run: `cd scripts && node -e "require('./sources/kalshi').fetchKalshiCatalog({cap:10}).then(c=>console.log(c.length, c[0]))"`
Expected: prints a count > 0 and one market object with `ticker`, `marketProb`, `volume24h`.

- [ ] **Step 6: Commit**

```bash
git add scripts/sources/kalshi.js scripts/test/kalshi.test.js
git commit -m "feat: kalshi catalog fetch with pagination + auth stubs"
```

---

## Task 4: PizzINT OSINT feed + DOUGHCON parsing

**Files:**
- Create: `scripts/sources/pizzint.js`
- Create: `scripts/test/pizzint.test.js`

- [ ] **Step 1: Write failing tests against the live fixture**

Create `scripts/test/pizzint.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { parseOsintFeed, parseDoughcon } = require("../sources/pizzint");

const HTML = fs.readFileSync(path.join(__dirname, "fixtures/pizzint.html"), "utf8");

test("parseOsintFeed extracts reports with account + source link", () => {
  const reports = parseOsintFeed(HTML);
  assert.ok(reports.length >= 5, `expected several reports, got ${reports.length}`);
  const r = reports[0];
  assert.ok(typeof r.account === "string" && r.account.length > 0);
  assert.match(r.url, /x\.com\/.+\/status\/\d+/);
  assert.ok(typeof r.text === "string");
});

test("parseDoughcon extracts numeric level", () => {
  const d = parseDoughcon(HTML);
  assert.ok(d.level >= 1 && d.level <= 5, `level out of range: ${d.level}`);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && node --test test/pizzint.test.js`
Expected: FAIL — `Cannot find module '../sources/pizzint'`

- [ ] **Step 3: Implement `sources/pizzint.js`**

```js
const { httpGet } = require("../lib/http");

const PIZZINT_URL = "https://www.pizzint.watch/";

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Each OSINT card contains report text followed by a link to the original tweet.
// Heuristic: for each x.com status link, take the stripped text in the preceding window.
function parseOsintFeed(html) {
  const re = /<a[^>]+href="https:\/\/x\.com\/(\w+)\/status\/(\d+)"/g;
  const reports = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, account, id] = m;
    if (seen.has(id)) continue;
    seen.add(id);
    const before = html.slice(Math.max(0, m.index - 900), m.index);
    const text = stripTags(before).slice(-240).trim();
    reports.push({ account, url: `https://x.com/${account}/status/${id}`, text });
  }
  return reports;
}

// "DOUGHCON 4 DOUBLE TAKE" -> { level: 4, label: "DOUBLE TAKE" }
function parseDoughcon(html) {
  const text = stripTags(html);
  const m = text.match(/DOUGHCON\s+(\d)\s+([A-Z][A-Z ]*?)(?:\s+•|\s+INCREASED|\s+SUPPORT|$)/);
  if (!m) return { level: null, label: null };
  return { level: Number(m[1]), label: m[2].trim() };
}

async function fetchPizzint() {
  const html = await httpGet(PIZZINT_URL);
  return { reports: parseOsintFeed(html), doughcon: parseDoughcon(html) };
}

module.exports = { PIZZINT_URL, stripTags, parseOsintFeed, parseDoughcon, fetchPizzint };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && node --test test/pizzint.test.js`
Expected: PASS (2 tests). If `parseDoughcon` level is null, inspect `fixtures/pizzint.html` for the current DOUGHCON wording and adjust the regex's trailing alternation; re-run until green.

- [ ] **Step 5: Live smoke test**

Run: `cd scripts && node -e "require('./sources/pizzint').fetchPizzint().then(r=>console.log('reports',r.reports.length,'doughcon',r.doughcon))"`
Expected: prints a report count and a DOUGHCON object.

- [ ] **Step 6: Commit**

```bash
git add scripts/sources/pizzint.js scripts/test/pizzint.test.js
git commit -m "feat: pizzint osint feed + doughcon parsing"
```

---

## Task 5: Drudge headline extraction

**Files:**
- Create: `scripts/sources/drudge.js`
- Create: `scripts/test/drudge.test.js`

- [ ] **Step 1: Write failing tests against the live fixture**

Create `scripts/test/drudge.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { extractHeadlines } = require("../sources/drudge");

const HTML = fs.readFileSync(path.join(__dirname, "fixtures/drudge.html"), "utf8");

test("extractHeadlines returns deduped, capped headline strings", () => {
  const heads = extractHeadlines(HTML, { cap: 80 });
  assert.ok(heads.length > 10, `expected many headlines, got ${heads.length}`);
  assert.ok(heads.length <= 80);
  assert.strictEqual(new Set(heads).size, heads.length, "should be deduped");
  for (const h of heads) assert.ok(h.length >= 15);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && node --test test/drudge.test.js`
Expected: FAIL — `Cannot find module '../sources/drudge'`

- [ ] **Step 3: Implement `sources/drudge.js`**

```js
const { httpGet } = require("../lib/http");

const DRUDGE_URL = "https://drudgereport.com/";

// Drudge headlines are anchor texts. Keep substantial, mostly-text anchor labels.
function extractHeadlines(html, { cap = 80 } = {}) {
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 15) continue;            // skip nav/short links
    if (/^https?:\/\//i.test(text)) continue;  // skip bare URLs
    const key = text.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

async function fetchDrudge() {
  const html = await httpGet(DRUDGE_URL);
  return extractHeadlines(html, { cap: 80 });
}

module.exports = { DRUDGE_URL, extractHeadlines, fetchDrudge };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && node --test test/drudge.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add scripts/sources/drudge.js scripts/test/drudge.test.js
git commit -m "feat: drudge headline extraction"
```

---

## Task 6: GDELT theater queries + article normalization

**Files:**
- Create: `scripts/sources/gdelt.js`
- Create: `scripts/test/gdelt.test.js`

- [ ] **Step 1: Write failing tests against the fixture**

Create `scripts/test/gdelt.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { THEATER_QUERIES, normalizeArticles } = require("../sources/gdelt");

test("THEATER_QUERIES covers the five theaters", () => {
  const names = THEATER_QUERIES.map((q) => q.theater);
  for (const t of ["Middle East", "Indo-Pacific", "Europe", "Energy", "Americas"]) {
    assert.ok(names.includes(t), `missing theater ${t}`);
  }
});

test("normalizeArticles maps GDELT artlist json to title+domain, capped", () => {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/gdelt-europe.json"), "utf8"));
  const arts = normalizeArticles(json, 2);
  assert.strictEqual(arts.length, 2);
  assert.ok(arts[0].title.length > 0);
  assert.ok(arts[0].domain.length > 0);
});

test("normalizeArticles tolerates empty/missing articles", () => {
  assert.deepStrictEqual(normalizeArticles({}, 5), []);
  assert.deepStrictEqual(normalizeArticles(null, 5), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && node --test test/gdelt.test.js`
Expected: FAIL — `Cannot find module '../sources/gdelt'`

- [ ] **Step 3: Implement `sources/gdelt.js`**

```js
const { httpGet } = require("../lib/http");

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

// Tuned per-theater queries — generic queries return noise, so constrain by theme terms + English.
const THEATER_QUERIES = [
  { theater: "Middle East", query: "(Iran OR Israel OR Gaza OR \"Red Sea\" OR Hormuz OR Lebanon) sourcelang:eng" },
  { theater: "Indo-Pacific", query: "(China OR Taiwan OR \"South China Sea\" OR \"North Korea\" OR Philippines) sourcelang:eng" },
  { theater: "Europe", query: "(Ukraine OR Russia OR NATO OR Putin OR Baltic) sourcelang:eng" },
  { theater: "Energy", query: "(oil OR \"crude\" OR OPEC OR \"natural gas\" OR LNG OR pipeline) sourcelang:eng" },
  { theater: "Americas", query: "(Venezuela OR Mexico OR \"Latin America\" OR cartel OR Panama) sourcelang:eng" },
];

function normalizeArticles(json, cap = 8) {
  const arts = (json && json.articles) || [];
  return arts.slice(0, cap).map((a) => ({ title: a.title || "", domain: a.domain || "" }));
}

function buildUrl(query) {
  const q = encodeURIComponent(query);
  return `${GDELT_BASE}?query=${q}&mode=artlist&maxrecords=8&timespan=48h&sort=hybridrel&format=json`;
}

// GDELT rate-limits (~1 req / 5s). Fetch theaters sequentially with a delay; tolerate failures.
async function fetchGdelt() {
  const results = [];
  for (const { theater, query } of THEATER_QUERIES) {
    try {
      const json = await httpGet(buildUrl(query), { json: true, timeoutMs: 20000 });
      results.push({ theater, articles: normalizeArticles(json, 8) });
    } catch (e) {
      results.push({ theater, articles: [] });
    }
    await new Promise((r) => setTimeout(r, 5500)); // respect GDELT rate limit
  }
  return results;
}

module.exports = { GDELT_BASE, THEATER_QUERIES, normalizeArticles, buildUrl, fetchGdelt };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && node --test test/gdelt.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/sources/gdelt.js scripts/test/gdelt.test.js
git commit -m "feat: gdelt theater queries + article normalization"
```

---

## Task 7: Context assembly

**Files:**
- Create: `scripts/lib/context.js`
- Create: `scripts/test/context.test.js`

- [ ] **Step 1: Write failing tests**

Create `scripts/test/context.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { buildContext } = require("../lib/context");

const SOURCES = {
  drudge: ["Headline one about politics", "Headline two about war"],
  pizzint: { reports: [{ account: "osintwarfare", text: "tanks moving near border", url: "https://x.com/osintwarfare/status/1" }], doughcon: { level: 4, label: "DOUBLE TAKE" } },
  gdelt: [{ theater: "Europe", articles: [{ title: "NATO drills expand", domain: "wire.org" }] }],
  kalshi: [{ ticker: "KX-A", title: "Ceasefire by 2026", marketProb: 45, priceChange24h: 6, volume24h: 1200, openInterest: 9000, category: "World" }],
};

test("buildContext includes a labeled block per source", () => {
  const ctx = buildContext(SOURCES);
  assert.match(ctx, /DRUDGE/);
  assert.match(ctx, /PIZZINT|OSINT/);
  assert.match(ctx, /GDELT/);
  assert.match(ctx, /PREDICTION-MARKET ACTION/);
  assert.match(ctx, /DOUGHCON 4/);
  assert.match(ctx, /KX-A/);
});

test("buildContext tolerates missing sources", () => {
  const ctx = buildContext({ drudge: [], pizzint: { reports: [], doughcon: { level: null } }, gdelt: [], kalshi: [] });
  assert.ok(typeof ctx === "string" && ctx.length > 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && node --test test/context.test.js`
Expected: FAIL — `Cannot find module '../lib/context'`

- [ ] **Step 3: Implement `lib/context.js`**

```js
// Assemble the four sources into one shared CONTEXT string with clear section headers.
// Each block is bounded so input tokens stay predictable.
function buildContext({ drudge = [], pizzint = {}, gdelt = [], kalshi = [] }) {
  const blocks = [];

  blocks.push(
    "=== DRUDGE HEADLINES ===\n" +
      (drudge.length ? drudge.map((h) => `- ${h}`).join("\n") : "(none)")
  );

  const d = pizzint.doughcon || {};
  const reports = (pizzint.reports || []).slice(0, 40);
  blocks.push(
    `=== PIZZINT OSINT FEED (DOUGHCON ${d.level ?? "?"}${d.label ? " " + d.label : ""}) ===\n` +
      (reports.length ? reports.map((r) => `- [@${r.account}] ${r.text}`).join("\n") : "(none)")
  );

  blocks.push(
    "=== GDELT GLOBAL WIRE (by theater) ===\n" +
      (gdelt.length
        ? gdelt
            .map((g) => `# ${g.theater}\n` + (g.articles || []).map((a) => `- ${a.title} (${a.domain})`).join("\n"))
            .join("\n")
        : "(none)")
  );

  blocks.push(
    "=== PREDICTION-MARKET ACTION (Kalshi) ===\n" +
      (kalshi.length
        ? kalshi
            .map(
              (m) =>
                `- [${m.ticker}] ${m.title} | price ${m.marketProb}% | 24h Δ${m.priceChange24h >= 0 ? "+" : ""}${m.priceChange24h}¢ | vol ${m.volume24h} | OI ${m.openInterest} | ${m.category}`
            )
            .join("\n")
        : "(none)")
  );

  return blocks.join("\n\n");
}

module.exports = { buildContext };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && node --test test/context.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/context.js scripts/test/context.test.js
git commit -m "feat: shared CONTEXT assembly from four sources"
```

---

## Task 8: Claude wrapper (no search, prompt-cached, tiered)

**Files:**
- Create: `scripts/lib/claude.js`
- Create: `scripts/test/claude.test.js`

- [ ] **Step 1: Write failing tests for the pure helpers**

Create `scripts/test/claude.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { parseJSON, stripCites, extractText, SONNET, HAIKU } = require("../lib/claude");

test("model constants are current ids", () => {
  assert.strictEqual(SONNET, "claude-sonnet-4-6");
  assert.strictEqual(HAIKU, "claude-haiku-4-5-20251001");
});

test("parseJSON strips fences, cite tags, bracket refs", () => {
  const text = '```json\n{"a": <cite x>1</cite>, "b": "ok [1,2]"}\n```';
  assert.deepStrictEqual(parseJSON(text), { a: 1, b: "ok " });
});

test("stripCites cleans nested objects", () => {
  const obj = { h: "war <cite a>now</cite> [3]" };
  assert.deepStrictEqual(stripCites(obj), { h: "war now " });
});

test("extractText joins text blocks", () => {
  const data = { content: [{ type: "text", text: "a" }, { type: "tool_use" }, { type: "text", text: "b" }] };
  assert.strictEqual(extractText(data), "a\nb");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && node --test test/claude.test.js`
Expected: FAIL — `Cannot find module '../lib/claude'`

- [ ] **Step 3: Implement `lib/claude.js`**

```js
const fetch = require("node-fetch");

const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";
const API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are STRATWATCH — a senior US strategic intelligence analyst. You assess global geopolitical developments for their implications to US interests, security, and foreign policy.

You are given a CONTEXT block of pre-gathered intelligence (Drudge headlines, PizzINT OSINT feed, GDELT global wire, and live Kalshi prediction-market action). Reason ONLY over the provided CONTEXT plus your own knowledge — do NOT claim to browse. Treat prediction-market price/volume/open-interest moves as intelligence signals.

Be direct. Assign explicit probabilities with honest confidence. Return clean plain text — no citation tags, no square-bracket references, no markdown fences.`;

function stripCites(obj) {
  const str = JSON.stringify(obj);
  const cleaned = str.replace(/<cite[^>]*>(.*?)<\/cite>/gs, "$1").replace(/\[[\d,\s-]+\]/g, "");
  return JSON.parse(cleaned);
}

function parseJSON(text) {
  let clean = text
    .replace(/<cite[^>]*>(.*?)<\/cite>/gs, "$1")
    .replace(/\[[\d,\s-]+\]/g, "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  return JSON.parse(clean.slice(start, end + 1));
}

function extractText(data) {
  return (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

// One Claude call. CONTEXT is sent as a cache-marked content block (cheap on repeat reads); no web search.
async function callClaude({ model, context, prompt, maxTokens = 2000 }) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `CONTEXT:\n${context}`, cache_control: { type: "ephemeral" } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  return extractText(await res.json());
}

module.exports = { SONNET, HAIKU, SYSTEM_PROMPT, callClaude, parseJSON, stripCites, extractText };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && node --test test/claude.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/claude.js scripts/test/claude.test.js
git commit -m "feat: claude wrapper (no search, prompt-cached, tiered models)"
```

---

## Task 9: Market-edge math (gap + favorable flag)

**Files:**
- Create: `scripts/lib/edge.js`
- Create: `scripts/test/edge.test.js`

- [ ] **Step 1: Write failing tests**

Create `scripts/test/edge.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { computeGap, isFavorable } = require("../lib/edge");

test("computeGap = aiProb - marketProb, null-safe", () => {
  assert.strictEqual(computeGap(70, 45), 25);
  assert.strictEqual(computeGap(10, 40), -30);
  assert.strictEqual(computeGap(50, null), null);
  assert.strictEqual(computeGap(null, 50), null);
});

test("isFavorable: large gap AND non-low confidence", () => {
  assert.strictEqual(isFavorable(25, "HIGH"), true);
  assert.strictEqual(isFavorable(-20, "MEDIUM"), true);
  assert.strictEqual(isFavorable(25, "LOW"), false);   // low confidence -> not actionable
  assert.strictEqual(isFavorable(10, "HIGH"), false);  // gap too small
  assert.strictEqual(isFavorable(null, "HIGH"), false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && node --test test/edge.test.js`
Expected: FAIL — `Cannot find module '../lib/edge'`

- [ ] **Step 3: Implement `lib/edge.js`**

```js
const FAVORABLE_GAP = 15; // percentage points

// STRATWATCH probability minus market-implied probability (both 0-100).
function computeGap(aiProb, marketProb) {
  if (aiProb == null || marketProb == null) return null;
  return aiProb - marketProb;
}

// Actionable edge: meaningful divergence we are not unsure about.
function isFavorable(gap, confidence) {
  if (gap == null) return false;
  if (String(confidence).toUpperCase() === "LOW") return false;
  return Math.abs(gap) >= FAVORABLE_GAP;
}

module.exports = { FAVORABLE_GAP, computeGap, isFavorable };
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts && node --test test/edge.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/edge.js scripts/test/edge.test.js
git commit -m "feat: market-edge math (gap, favorable flag)"
```

---

## Task 10: Orchestrator rewrite (`run.js`)

**Files:**
- Modify (rewrite): `scripts/run.js`

This wires Steps 0-4 together. There is no unit test (it is I/O orchestration); it is validated by the live smoke run in Step 3 and Task 11.

- [ ] **Step 1: Replace `scripts/run.js` entirely**

```js
// STRATWATCH Intelligence Runner — scraped-context, market-aware pipeline.
// Step 0 collects four sources -> shared CONTEXT. Steps 1-4 reason over it (no web search).
const fs = require("fs");
const path = require("path");

const { fetchDrudge } = require("./sources/drudge");
const { fetchPizzint } = require("./sources/pizzint");
const { fetchGdelt } = require("./sources/gdelt");
const { fetchKalshiCatalog } = require("./sources/kalshi");
const { buildContext } = require("./lib/context");
const { callClaude, parseJSON, stripCites, SONNET, HAIKU } = require("./lib/claude");
const { computeGap, isFavorable } = require("./lib/edge");

const OUT_PATH = path.join(__dirname, "..", "docs", "intelligence.json");

async function settled(label, p) {
  try {
    const v = await p;
    console.log(`  ${label}: ok`);
    return v;
  } catch (e) {
    console.error(`  ${label}: FAILED ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("\n=== STRATWATCH INTELLIGENCE RUN ===");
  console.log(new Date().toISOString() + "\n");

  const today = new Date().toDateString();
  const output = {
    generatedAt: new Date().toISOString(),
    runNumber: 1,
    situation: null,
    signals: [],
    scanNote: null,
    markets: [],
    watchSignals: [],
    groundTruth: [],
  };
  try {
    output.runNumber = (JSON.parse(fs.readFileSync(OUT_PATH, "utf8")).runNumber || 0) + 1;
  } catch (_) {}

  // STEP 0 — SOURCES
  console.log("Step 0/4: Collecting sources...");
  const [drudge, pizzint, gdelt, kalshi] = await Promise.all([
    settled("drudge", fetchDrudge()),
    settled("pizzint", fetchPizzint()),
    settled("gdelt", fetchGdelt()),
    settled("kalshi", fetchKalshiCatalog({ cap: 50 })),
  ]);
  const catalog = kalshi || [];
  const context = buildContext({
    drudge: drudge || [],
    pizzint: pizzint || { reports: [], doughcon: {} },
    gdelt: gdelt || [],
    kalshi: catalog,
  });
  console.log(`  CONTEXT built (${context.length} chars, ${catalog.length} markets)`);

  // STEP 1 — SITUATION (Sonnet)
  console.log("\nStep 1/4: Situation (Sonnet)...");
  try {
    const text = await callClaude({ model: SONNET, context, maxTokens: 2000, prompt:
`Using ONLY the CONTEXT above as of ${today}, produce the global situation assessment.
Return ONLY valid JSON, plain text values, no markdown, no citations:
{
  "headline": "single most strategically important development for US interests",
  "velocity": "ACCELERATING|STABLE|DECELERATING",
  "domains": [
    {"name": "Middle East", "prob": 0, "label": "regional escalation 90d", "trajectory": "UP|DOWN|FLAT", "status": "one sentence"},
    {"name": "Indo-Pacific", "prob": 0, "label": "China coercion escalation", "trajectory": "UP|DOWN|FLAT", "status": "one sentence"},
    {"name": "Europe", "prob": 0, "label": "NATO cohesion fracture", "trajectory": "UP|DOWN|FLAT", "status": "one sentence"},
    {"name": "Energy", "prob": 0, "label": "supply shock 60d", "trajectory": "UP|DOWN|FLAT", "status": "one sentence"},
    {"name": "US Politics", "prob": 0, "label": "House flip Nov 2026", "trajectory": "UP|DOWN|FLAT", "status": "one sentence"}
  ],
  "unseen": "most non-obvious cross-domain pattern analysts are missing",
  "criticalWindow": "most time-sensitive decision point in next 30-90 days",
  "watchFor": ["trigger 1", "trigger 2", "trigger 3", "trigger 4"],
  "confidenceNote": "honest statement of key uncertainties",
  "topPattern": "one sentence connecting the most important dots, citing market action where relevant"
}` });
    output.situation = parseJSON(text);
    console.log(`  Done: "${(output.situation.headline || "").slice(0, 70)}"`);
  } catch (e) {
    console.error(`  Failed: ${e.message}`);
    output.situation = { headline: "Assessment unavailable", velocity: "STABLE", domains: [], watchFor: [], unseen: "", criticalWindow: "", confidenceNote: "", topPattern: "" };
  }

  // STEP 2 — SIGNALS (Haiku)
  console.log("\nStep 2/4: Signals (Haiku)...");
  try {
    const text = await callClaude({ model: HAIKU, context, maxTokens: 2000, prompt:
`From the CONTEXT above as of ${today}, surface 5-7 of the most significant signals. Prioritize what is new, unexpected, or contradicts consensus.
Return ONLY valid JSON, plain text, no markdown, no citations:
{
  "signals": [
    {"id": "sig1", "domain": "Middle East|Indo-Pacific|Europe|Americas|Africa|Energy|Technology|US Politics", "headline": "concise factual headline", "significance": "CRITICAL|HIGH|MEDIUM|LOW", "summary": "2-3 sentences", "signal": "non-obvious implication for US interests", "contradicts": "consensus this challenges, or null"}
  ],
  "scanNote": "one sentence on signal quality"
}` });
    const parsed = parseJSON(text);
    output.signals = (parsed.signals || []).map((s, i) => ({ ...s, id: s.id || `sig${i + 1}`, timestamp: new Date().toISOString() }));
    output.scanNote = parsed.scanNote || null;
    console.log(`  Done: ${output.signals.length} signals`);
  } catch (e) {
    console.error(`  Failed: ${e.message}`);
  }

  // STEP 3 — WATCH + GROUND TRUTH (Haiku)
  console.log("\nStep 3/4: Watch list + ground truth (Haiku)...");
  try {
    const text = await callClaude({ model: HAIKU, context, maxTokens: 2000, prompt:
`From the CONTEXT above as of ${today}, give the 6 most important observable things to watch over the next 2-4 weeks and the 5 most important established facts across domains.
Return ONLY valid JSON, plain text, no markdown, no citations:
{
  "watchSignals": ["observable trigger 1","observable trigger 2","observable trigger 3","observable trigger 4","observable trigger 5","observable trigger 6"],
  "groundTruth": [
    {"id": "gt1", "domain": "domain", "headline": "established fact", "significance": "CRITICAL|HIGH", "summary": "2-3 sentences", "signal": "implication for US"}
  ]
}` });
    const parsed = parseJSON(text);
    output.watchSignals = parsed.watchSignals || [];
    output.groundTruth = parsed.groundTruth || [];
    console.log(`  Done: ${output.watchSignals.length} watch, ${output.groundTruth.length} ground truth`);
  } catch (e) {
    console.error(`  Failed: ${e.message}`);
  }

  // STEP 4 — MARKET EDGE (Sonnet picks; code computes gap/favorable from live prices)
  console.log("\nStep 4/4: Market edge (Sonnet)...");
  output.markets = [];
  if (catalog.length) {
    try {
      const text = await callClaude({ model: SONNET, context, maxTokens: 2000, prompt:
`The CONTEXT includes live Kalshi markets (PREDICTION-MARKET ACTION). Using the intelligence above as of ${today}, select the 6-10 markets MOST relevant to current geopolitical developments. For each, assign STRATWATCH's own probability (0-100) that the market resolves YES, based on the intel.
Use ONLY tickers that appear in the CONTEXT. Return ONLY valid JSON, plain text, no markdown, no citations:
{
  "selections": [
    {"ticker": "EXACT_TICKER_FROM_CONTEXT", "label": "short human label", "domain": "Middle East|Indo-Pacific|Europe|Americas|Energy|US Politics", "aiProb": 0, "confidence": "HIGH|MEDIUM|LOW", "rationale": "one sentence tied to the intel"}
  ]
}` });
      const parsed = parseJSON(text);
      const byTicker = new Map(catalog.map((m) => [m.ticker, m]));
      output.markets = (parsed.selections || [])
        .map((s) => {
          const live = byTicker.get(s.ticker);
          if (!live) return null; // drop hallucinated tickers
          const gap = computeGap(s.aiProb, live.marketProb);
          return {
            ticker: live.ticker,
            label: s.label || live.title,
            domain: s.domain || live.category,
            marketProb: live.marketProb,
            aiProb: s.aiProb,
            gap,
            favorable: isFavorable(gap, s.confidence),
            confidence: s.confidence,
            rationale: s.rationale || "",
            volume24h: live.volume24h,
            openInterest: live.openInterest,
            priceChange24h: live.priceChange24h,
            url: live.url,
          };
        })
        .filter(Boolean);
      console.log(`  Done: ${output.markets.length} markets, ${output.markets.filter((m) => m.favorable).length} favorable`);
    } catch (e) {
      console.error(`  Failed: ${e.message}`);
    }
  } else {
    console.log("  Skipped: no Kalshi catalog");
  }

  // WRITE
  const clean = stripCites(output);
  fs.writeFileSync(OUT_PATH, JSON.stringify(clean, null, 2));
  console.log(`\n=== COMPLETE: Run #${clean.runNumber} ===`);
  console.log(`Situation: ${(clean.situation?.headline || "").slice(0, 60)}`);
  console.log(`Signals: ${clean.signals.length} | Watch: ${clean.watchSignals.length} | Markets: ${clean.markets.length}`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
```

- [ ] **Step 2: Verify the file parses**

Run: `cd scripts && node --check run.js`
Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add scripts/run.js
git commit -m "feat: rewrite runner as scraped-context, market-aware pipeline"
```

---

## Task 11: Full live smoke test + workflow secret

**Files:**
- Modify: `.github/workflows/intelligence.yml`

- [ ] **Step 1: Run the whole pipeline against a real key**

Run:
```bash
cd scripts && ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" npm start
```
Expected: Step 0 logs four sources, CONTEXT char count, then Steps 1-4 complete; final summary shows non-zero Signals and Markets. (Requires a valid key in the environment.)

- [ ] **Step 2: Inspect the output**

Run:
```bash
cd /Users/domdigiovanni/stratwatch && node -e "const d=require('./docs/intelligence.json'); console.log('markets',d.markets.length,'favorable',d.markets.filter(m=>m.favorable).length); console.log(d.markets[0]); console.log('situation:',d.situation.headline)"
```
Expected: a populated `markets[0]` with `ticker`, `marketProb`, `aiProb`, `gap`, `favorable`; a real situation headline. Confirm no `slug`/Polymarket remnants.

- [ ] **Step 3: Confirm the frontend still renders the markets**

Run: `cd /Users/domdigiovanni/stratwatch && python3 -m http.server -d docs 8765` then open `http://localhost:8765` and confirm the markets section populates. Stop the server with Ctrl-C.
If the frontend reads a field the new objects lack, note it — existing keys (`label, domain, marketProb, aiProb, gap, confidence, rationale, volume24h, url`) are all preserved, so it should render unchanged.

- [ ] **Step 4: Wire the Kalshi secret passthrough (ready for future auth)**

Edit `.github/workflows/intelligence.yml` — in the "Run intelligence gathering" step's `env:` block, add the Kalshi key alongside the Anthropic key:

```yaml
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          KALSHI_API_KEY: ${{ secrets.KALSHI_API_KEY }}
```

(The catalog fetch needs no auth today; this makes the secret available for the future authenticated trade step without another workflow edit.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/intelligence.yml docs/intelligence.json
git commit -m "chore: live run output + wire KALSHI_API_KEY secret for future auth"
```

---

## Task 12: Run full suite + cleanup

- [ ] **Step 1: Run all unit tests**

Run: `cd scripts && npm test`
Expected: all suites pass (http, kalshi, pizzint, drudge, gdelt, context, claude, edge).

- [ ] **Step 2: Confirm no web_search remains**

Run: `cd /Users/domdigiovanni/stratwatch && grep -rn "web_search\|web-search\|gamma-api\|polymarket\|POLY_MARKETS" scripts/ || echo "clean"`
Expected: `clean` (the old runner's search + Polymarket code is fully gone).

- [ ] **Step 3: Final commit**

```bash
git add -A && git commit -m "chore: stratwatch scraped-context pipeline complete" --allow-empty
```

---

## Verification checklist (maps to spec)

- [ ] `web_search` tool + beta header removed everywhere (Task 8, Task 12 Step 2).
- [ ] Four sources scraped into one shared, cache-marked CONTEXT (Tasks 4-8).
- [ ] Tiered models: Sonnet for situation + market-edge, Haiku for signals + watch (Tasks 8, 10).
- [ ] PizzINT browser-UA + OSINT/DOUGHCON parsing (Tasks 0, 4).
- [ ] GDELT tuned per-theater queries with rate-limit handling (Task 6).
- [ ] Kalshi dynamic discovery by category, ranked, capped (Tasks 1-3).
- [ ] Step 4 emits gap + favorable against live Kalshi prices; hallucinated tickers dropped (Tasks 9, 10).
- [ ] Output JSON keeps existing keys; frontend unchanged (Task 11 Step 3).
- [ ] Dead Polymarket removed (Task 12 Step 2).
- [ ] Authenticated Kalshi left as stubs; KALSHI_API_KEY secret wired for later (Tasks 3, 11).
- [ ] Per-source fault tolerance — any one source failing still yields a valid run (Task 10 `settled`).
