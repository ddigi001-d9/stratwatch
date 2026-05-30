const { test } = require("node:test");
const assert = require("node:assert");
const { computeGap, isFavorable } = require("../lib/edge");

test("computeGap = aiProb - marketProb, null-safe", () => {
  assert.strictEqual(computeGap(70, 45), 25);
  assert.strictEqual(computeGap(10, 40), -30);
  assert.strictEqual(computeGap(50, null), null);
  assert.strictEqual(computeGap(null, 50), null);
});

test("computeGap rejects untrusted aiProb (out-of-range, non-numeric, null)", () => {
  assert.strictEqual(computeGap(150, 45), null);  // out of range — impossible probability
  assert.strictEqual(computeGap(-5, 45), null);   // out of range
  assert.strictEqual(computeGap("oops", 45), null);
  assert.strictEqual(computeGap(undefined, 45), null);
  assert.strictEqual(computeGap(NaN, 45), null);
  assert.strictEqual(computeGap(0, 45), -45);     // 0 is valid
  assert.strictEqual(computeGap(100, 45), 55);    // 100 is valid
  // NOTE: a value like 0.7 is a legal 0.7% probability, indistinguishable from a
  // fraction-vs-percent unit error, so it is accepted as-is (cannot be rejected).
  assert.strictEqual(computeGap(0.7, 45), -44.3);
});

test("isFavorable: large gap AND explicit HIGH/MEDIUM confidence", () => {
  assert.strictEqual(isFavorable(25, "HIGH"), true);
  assert.strictEqual(isFavorable(-20, "MEDIUM"), true);
  assert.strictEqual(isFavorable(25, "LOW"), false);   // low confidence -> not actionable
  assert.strictEqual(isFavorable(25, undefined), false); // missing confidence -> not actionable
  assert.strictEqual(isFavorable(25, ""), false);
  assert.strictEqual(isFavorable(10, "HIGH"), false);  // gap too small
  assert.strictEqual(isFavorable(null, "HIGH"), false);
});
