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
