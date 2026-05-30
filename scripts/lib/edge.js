const FAVORABLE_GAP = 15; // percentage points

// STRATWATCH probability minus market-implied probability (both 0-100).
// aiProb comes from the model and is not trusted: reject fractions (0.7 vs 70),
// out-of-range, and non-numeric values so a unit error can't fabricate an edge.
function computeGap(aiProb, marketProb) {
  if (marketProb == null || aiProb == null) return null;
  const n = Number(aiProb);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n - marketProb;
}

// Actionable edge: meaningful divergence with an explicit, non-low confidence.
function isFavorable(gap, confidence) {
  if (gap == null) return false;
  const c = String(confidence).toUpperCase();
  if (c !== "HIGH" && c !== "MEDIUM") return false; // missing/unknown confidence is not actionable
  return Math.abs(gap) >= FAVORABLE_GAP;
}

module.exports = { FAVORABLE_GAP, computeGap, isFavorable };
