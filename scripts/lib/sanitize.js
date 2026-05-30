// Output sanitization — the model reads untrusted scraped text (tweets, article
// titles) and could be prompt-injected into emitting hostile values. Everything
// the model produces is neutralized here BEFORE it is written to intelligence.json
// (which the public PWA renders). This is the primary XSS/data-integrity defense;
// the frontend escaping is defense-in-depth.

const MAX_TEXT = 2000;

const VELOCITY = ["ACCELERATING", "STABLE", "DECELERATING"];
const TRAJECTORY = ["UP", "DOWN", "FLAT"];
const SIGNIFICANCE = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const CONFIDENCE = ["HIGH", "MEDIUM", "LOW"];

// Coerce to a string and strip angle brackets so no markup can ever survive.
function cleanText(s) {
  if (s == null) return "";
  return String(s).replace(/[<>]/g, "").trim().slice(0, MAX_TEXT);
}

// Finite number within optional [min,max], else null. Rejects string payloads.
function cleanNum(v, { min = -Infinity, max = Infinity } = {}) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

// Whitelist a value (case-insensitive) against allowed options, else fallback.
function oneOf(v, allowed, fallback) {
  const up = String(v == null ? "" : v).toUpperCase();
  return allowed.includes(up) ? up : fallback;
}

// Only keep http(s) URLs; drop javascript:/data: and anything malformed.
function cleanUrl(u) {
  const s = cleanText(u);
  return /^https?:\/\//i.test(s) ? s : null;
}

function sanitizeDomain(dom) {
  return {
    name: cleanText(dom && dom.name),
    prob: cleanNum(dom && dom.prob, { min: 0, max: 100 }),
    label: cleanText(dom && dom.label),
    trajectory: oneOf(dom && dom.trajectory, TRAJECTORY, "FLAT"),
    status: cleanText(dom && dom.status),
  };
}

function sanitizeSituation(s) {
  if (!s || typeof s !== "object") return null;
  return {
    headline: cleanText(s.headline),
    velocity: oneOf(s.velocity, VELOCITY, "STABLE"),
    domains: Array.isArray(s.domains) ? s.domains.map(sanitizeDomain) : [],
    unseen: cleanText(s.unseen),
    criticalWindow: cleanText(s.criticalWindow),
    watchFor: Array.isArray(s.watchFor) ? s.watchFor.map(cleanText) : [],
    confidenceNote: cleanText(s.confidenceNote),
    topPattern: cleanText(s.topPattern),
  };
}

function sanitizeSignal(s) {
  return {
    id: cleanText(s && s.id),
    domain: cleanText(s && s.domain),
    headline: cleanText(s && s.headline),
    significance: oneOf(s && s.significance, SIGNIFICANCE, "LOW"),
    summary: cleanText(s && s.summary),
    signal: cleanText(s && s.signal),
    contradicts: s && s.contradicts == null ? null : cleanText(s && s.contradicts),
    timestamp: cleanText(s && s.timestamp),
  };
}

function sanitizeGroundTruth(g) {
  return {
    id: cleanText(g && g.id),
    domain: cleanText(g && g.domain),
    headline: cleanText(g && g.headline),
    significance: oneOf(g && g.significance, SIGNIFICANCE, "LOW"),
    summary: cleanText(g && g.summary),
    signal: cleanText(g && g.signal),
  };
}

function sanitizeMarket(m) {
  return {
    ticker: cleanText(m && m.ticker),
    label: cleanText(m && m.label),
    domain: cleanText(m && m.domain),
    marketProb: cleanNum(m && m.marketProb, { min: 0, max: 100 }),
    aiProb: cleanNum(m && m.aiProb, { min: 0, max: 100 }),
    gap: cleanNum(m && m.gap, { min: -100, max: 100 }),
    favorable: Boolean(m && m.favorable === true),
    confidence: oneOf(m && m.confidence, CONFIDENCE, "LOW"),
    rationale: cleanText(m && m.rationale),
    volume24h: cleanNum(m && m.volume24h),
    openInterest: cleanNum(m && m.openInterest),
    priceChange24h: cleanNum(m && m.priceChange24h),
    url: cleanUrl(m && m.url),
  };
}

// Deep-sanitize the full runner output. Robust to missing/partial sections.
function sanitizeOutput(output) {
  const o = output || {};
  return {
    generatedAt: cleanText(o.generatedAt),
    runNumber: cleanNum(o.runNumber) ?? 0,
    situation: sanitizeSituation(o.situation),
    signals: Array.isArray(o.signals) ? o.signals.map(sanitizeSignal) : [],
    scanNote: o.scanNote == null ? null : cleanText(o.scanNote),
    markets: Array.isArray(o.markets) ? o.markets.map(sanitizeMarket) : [],
    watchSignals: Array.isArray(o.watchSignals) ? o.watchSignals.map(cleanText) : [],
    groundTruth: Array.isArray(o.groundTruth) ? o.groundTruth.map(sanitizeGroundTruth) : [],
  };
}

module.exports = { cleanText, cleanNum, oneOf, cleanUrl, sanitizeOutput };
