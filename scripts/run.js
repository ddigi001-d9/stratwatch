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
const { sanitizeOutput } = require("./lib/sanitize");

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
      const usedTickers = new Set();
      output.markets = (parsed.selections || [])
        .map((s) => {
          const live = byTicker.get(s.ticker);
          if (!live) return null; // drop hallucinated tickers
          if (usedTickers.has(live.ticker)) return null; // drop duplicate selections
          usedTickers.add(live.ticker);
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

  // WRITE — strip citation tags, then sanitize all model output (untrusted) so no
  // hostile value reaches intelligence.json / the public PWA. See lib/sanitize.js.
  const clean = sanitizeOutput(stripCites(output));
  fs.writeFileSync(OUT_PATH, JSON.stringify(clean, null, 2));
  console.log(`\n=== COMPLETE: Run #${clean.runNumber} ===`);
  console.log(`Situation: ${(clean.situation?.headline || "").slice(0, 60)}`);
  console.log(`Signals: ${clean.signals.length} | Watch: ${clean.watchSignals.length} | Markets: ${clean.markets.length}`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
