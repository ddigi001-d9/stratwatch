const { test } = require("node:test");
const assert = require("node:assert");
const { parseFp, marketFields } = require("../sources/kalshi");
const { filterRelevant, flatten, rankMarkets } = require("../sources/kalshi");
const { RELEVANT_CATEGORIES, catalogFromEvents, fetchPositions } = require("../sources/kalshi");
const fs = require("node:fs");
const path = require("node:path");

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
