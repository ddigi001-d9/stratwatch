const { test } = require("node:test");
const assert = require("node:assert");
const { cleanText, cleanNum, oneOf, sanitizeOutput } = require("../lib/sanitize");

test("cleanText strips angle brackets (no markup can survive)", () => {
  assert.strictEqual(cleanText('<img src=x onerror=alert(1)>'), "img src=x onerror=alert(1)");
  assert.strictEqual(cleanText('a <script>b</script> c'), "a scriptb/script c");
  assert.strictEqual(cleanText(null), "");
  assert.strictEqual(cleanText(undefined), "");
  assert.strictEqual(cleanText(42), "42");
});

test("cleanText trims and caps length", () => {
  assert.strictEqual(cleanText("  hi  "), "hi");
  assert.strictEqual(cleanText("x".repeat(5000)).length, 2000);
});

test("cleanNum returns finite number in range, else null", () => {
  assert.strictEqual(cleanNum("0.7"), 0.7);
  assert.strictEqual(cleanNum(70), 70);
  assert.strictEqual(cleanNum("<script>"), null);
  assert.strictEqual(cleanNum(null), null);
  assert.strictEqual(cleanNum(NaN), null);
  assert.strictEqual(cleanNum(150, { min: 0, max: 100 }), null);
  assert.strictEqual(cleanNum(-5, { min: 0, max: 100 }), null);
  assert.strictEqual(cleanNum(50, { min: 0, max: 100 }), 50);
});

test("oneOf whitelists against allowed values, case-insensitive, else fallback", () => {
  assert.strictEqual(oneOf("stable", ["ACCELERATING", "STABLE", "DECELERATING"], "STABLE"), "STABLE");
  assert.strictEqual(oneOf('"><img onerror=x>', ["HIGH", "MEDIUM", "LOW"], "LOW"), "LOW");
  assert.strictEqual(oneOf(null, ["HIGH", "LOW"], "LOW"), "LOW");
});

test("sanitizeOutput neutralizes a malicious model payload end-to-end", () => {
  const evil = {
    generatedAt: "2026-05-30T00:00:00Z",
    runNumber: 5,
    situation: {
      headline: 'Breaking <img src=x onerror=alert(document.cookie)>',
      velocity: 'x"><script>steal()</script>',
      domains: [
        { name: "Europe", prob: '<svg onload=alert(1)>', label: "x", trajectory: "evil<script>", status: "<b>hi" },
      ],
      unseen: "<script>", criticalWindow: "ok", confidenceNote: "ok", topPattern: "ok",
      watchFor: ["<iframe>", "normal trigger"],
    },
    signals: [
      { id: "sig1", domain: "Europe", headline: "<script>x</script>", significance: "EVIL", summary: "ok", signal: "ok", contradicts: null },
    ],
    scanNote: "ok",
    markets: [
      { ticker: "KX-A", label: "<img onerror=1>", domain: "Europe", marketProb: 45,
        aiProb: '<img src=x onerror=alert(1)>', gap: 999, favorable: "yes", confidence: "PWNED",
        rationale: "<script>", volume24h: 100, openInterest: 200, priceChange24h: 3, url: "javascript:alert(1)" },
    ],
    watchSignals: ["<script>alert(1)</script>", "watch this"],
    groundTruth: [
      { id: "gt1", domain: "Energy", headline: "<b>x", significance: "NOPE", summary: "ok", signal: "ok" },
    ],
  };

  const safe = sanitizeOutput(evil);
  const serialized = JSON.stringify(safe);

  // 1. No angle brackets survive anywhere — kills stored XSS at the source.
  assert.ok(!/[<>]/.test(serialized), `angle brackets leaked: ${serialized.match(/.{0,30}[<>].{0,30}/)}`);

  // 2. Enums are whitelisted to safe values.
  assert.strictEqual(safe.situation.velocity, "STABLE");
  assert.strictEqual(safe.situation.domains[0].trajectory, "FLAT");
  assert.strictEqual(safe.signals[0].significance, "LOW");
  assert.strictEqual(safe.markets[0].confidence, "LOW");
  assert.strictEqual(safe.groundTruth[0].significance, "LOW");

  // 3. Numeric fields are coerced to number-or-null (no string payloads).
  assert.strictEqual(safe.markets[0].aiProb, null);       // was an <img> string
  assert.strictEqual(safe.situation.domains[0].prob, null); // was an <svg> string
  assert.strictEqual(typeof safe.markets[0].marketProb, "number");

  // 4. favorable coerced to a real boolean.
  assert.strictEqual(typeof safe.markets[0].favorable, "boolean");

  // 5. Non-http(s) URL schemes are dropped.
  assert.strictEqual(safe.markets[0].url, null);
});

test("sanitizeOutput tolerates a degraded/empty run", () => {
  const safe = sanitizeOutput({ generatedAt: "t", runNumber: 1, situation: null, signals: [], markets: [], watchSignals: [], groundTruth: [] });
  assert.ok(typeof safe === "object");
  assert.deepStrictEqual(safe.markets, []);
});
