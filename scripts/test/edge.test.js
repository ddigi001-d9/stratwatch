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
