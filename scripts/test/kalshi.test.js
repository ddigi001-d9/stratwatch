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
