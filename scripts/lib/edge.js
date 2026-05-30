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
