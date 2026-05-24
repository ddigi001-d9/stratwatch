// STRATWATCH Intelligence Runner
// Full-spectrum geopolitical intelligence from a US strategic perspective
// Runs in GitHub Actions — writes docs/intelligence.json

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not set");
  process.exit(1);
}

// ── UTILITY ───────────────────────────────────────────────────────────────────
function stripCites(obj) {
  const str = JSON.stringify(obj);
  const cleaned = str
    .replace(/<cite[^>]*>(.*?)<\/cite>/gs, '$1')
    .replace(/\[[\d,\s-]+\]/g, '');
  return JSON.parse(cleaned);
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are STRATWATCH — a senior US strategic intelligence analyst. You monitor global geopolitical developments and assess their implications for US interests, security, and foreign policy.

Your mandate:
- Full-spectrum global coverage: every region, every domain (military, economic, political, energy, technology, alliances)
- US-centric lens: how does this affect American power, interests, allies, and vulnerabilities?
- Find what most analysts are missing — non-obvious patterns, second and third order effects
- Assign explicit probability estimates with honest confidence levels
- Flag when consensus is wrong
- Never speculate without evidence — search first, assess second

You cover all theaters simultaneously:
- Middle East and Gulf region
- Indo-Pacific: China, Taiwan, Korea, Japan, Southeast Asia
- Europe: NATO, Ukraine, Russia
- Americas: Latin America, Western Hemisphere
- Africa and emerging theaters
- Transversal: energy markets, technology competition, economic warfare, alliance cohesion

Search aggressively. Surface what matters. Be direct. Return clean text with no citation tags.`;

// ── PREDICTION MARKETS ────────────────────────────────────────────────────────
const POLY_MARKETS = [
  { label: "GOP Keeps House 2026",      slug: "will-republicans-keep-the-house-in-2026",       aiKey: "house_gop",       domain: "US Politics",  aiProb: 28, confidence: "HIGH",   rationale: "Special election overperformance, retirements, low approval. House flip is base case." },
  { label: "Ukraine Ceasefire 2026",    slug: "will-there-be-a-ceasefire-in-ukraine-in-2026",  aiKey: "ukraine_cease",   domain: "Europe",       aiProb: 45, confidence: "LOW",    rationale: "Trump wants exit, Ukraine exhausted, Europe pushing. Russia sees no urgency." },
  { label: "China Invades Taiwan 2026", slug: "will-china-invade-taiwan-in-2026",               aiKey: "taiwan_invasion", domain: "Indo-Pacific", aiProb: 8,  confidence: "MEDIUM", rationale: "Window opening but 2027 remains primary PLA readiness target. Gray zone more likely." },
  { label: "Oil >$120/bbl 2026",        slug: "will-brent-crude-oil-exceed-120-in-2026",        aiKey: "oil_spike",       domain: "Energy",       aiProb: 68, confidence: "MEDIUM", rationale: "Hormuz disruption plus supply shock already in progress." },
  { label: "Iran Nuclear Deal 2026",    slug: "will-us-iran-reach-nuclear-deal-in-2026",        aiKey: "iran_deal",       domain: "Middle East",  aiProb: 12, confidence: "MEDIUM", rationale: "Kinetic operations make diplomatic track nearly impossible near term." },
  { label: "Russia Takes Kyiv",         slug: "will-russia-capture-kyiv-by-end-of-2026",        aiKey: "russia_kyiv",     domain: "Europe",       aiProb: 4,  confidence: "HIGH",   rationale: "Russia lacks manpower and logistics for capital seizure." },
];

// ── CLAUDE API ────────────────────────────────────────────────────────────────
async function callClaude(messages, maxTokens = 2000) {
  console.log(`  Calling Claude (max ${maxTokens} tokens)...`);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractText(data) {
  return (data?.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
}

function parseJSON(text) {
  const clean = text
    .replace(/<cite[^>]*>(.*?)<\/cite>/gs, '$1')
    .replace(/\[[\d,\s-]+\]/g, '')
    .replace(/```json/g, '').replace(/```/g, '');
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in response");
  return JSON.parse(match[0]);
}

// ── POLYMARKET ────────────────────────────────────────────────────────────────
async function fetchPolymarket(slug) {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}&active=true`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const market = Array.isArray(data) ? data[0] : data;
    if (!market) return null;
    let yesProb = null;
    try {
      const prices = JSON.parse(market.outcomePrices || "[]");
      yesProb = prices[0] ? Math.round(parseFloat(prices[0]) * 100) : null;
    } catch (_) {}
    return { yesProb, volume24h: market.volume24hr ? parseFloat(market.volume24hr) : null, url: `https://polymarket.com/event/${slug}` };
  } catch (e) {
    console.warn(`  Polymarket failed for ${slug}: ${e.message}`);
    return null;
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n=== STRATWATCH INTELLIGENCE RUN ===");
  console.log(new Date().toISOString() + "\n");

  const outPath = path.join(__dirname, "..", "docs", "intelligence.json");
  const output = { generatedAt: new Date().toISOString(), runNumber: 1, situation: null, signals: [], markets: [], watchSignals: [], groundTruth: [] };

  try { output.runNumber = (JSON.parse(fs.readFileSync(outPath, "utf8")).runNumber || 0) + 1; } catch (_) {}

  const today = new Date().toDateString();

  // STEP 1 — SITUATION
  console.log("Step 1/4: Global situation assessment...");
  try {
    const data = await callClaude([{ role: "user", content: `Search for the most significant geopolitical developments across ALL global theaters as of ${today}. Cover: Middle East, Indo-Pacific, Europe/Russia/Ukraine, Americas, Africa, energy markets, technology competition, US alliance health.

Return ONLY valid JSON, no markdown fences, no citation tags, no square bracket references:
{
  "headline": "single most strategically important development for US interests right now",
  "velocity": "ACCELERATING|STABLE|DECELERATING",
  "domains": [
    {"name": "Middle East", "prob": 0, "label": "regional escalation 90d", "trajectory": "UP|DOWN|FLAT", "status": "current state in one plain sentence"},
    {"name": "Indo-Pacific", "prob": 0, "label": "China coercion escalation", "trajectory": "UP|DOWN|FLAT", "status": "current state in one plain sentence"},
    {"name": "Europe", "prob": 0, "label": "NATO cohesion fracture", "trajectory": "UP|DOWN|FLAT", "status": "current state in one plain sentence"},
    {"name": "Energy", "prob": 0, "label": "supply shock 60d", "trajectory": "UP|DOWN|FLAT", "status": "current state in one plain sentence"},
    {"name": "US Politics", "prob": 0, "label": "House flip Nov 2026", "trajectory": "UP|DOWN|FLAT", "status": "current state in one plain sentence"}
  ],
  "unseen": "most non-obvious cross-domain pattern analysts are missing — plain text no citations",
  "criticalWindow": "most time-sensitive decision point in next 30-90 days — plain text",
  "watchFor": ["specific trigger 1", "specific trigger 2", "specific trigger 3", "specific trigger 4"],
  "confidenceNote": "honest statement of key uncertainties — plain text",
  "topPattern": "one sentence connecting the most important dots across domains"
}` }], 2500);
    output.situation = parseJSON(extractText(data));
    console.log(`  Done: "${output.situation?.headline?.slice(0, 70)}"`);
  } catch (e) {
    console.error(`  Failed: ${e.message}`);
    output.situation = { headline: "Assessment unavailable — check Actions log", velocity: "STABLE", domains: [], watchFor: [], unseen: "", criticalWindow: "", confidenceNote: "", topPattern: "" };
  }

  // STEP 2 — SIGNALS
  console.log("\nStep 2/4: Signal scan...");
  try {
    const data = await callClaude([{ role: "user", content: `Search for the most significant geopolitical developments from the last 24-48 hours as of ${today}. Cast a wide global net. Surface 5-7 signals across different domains and regions. Prioritize what is new, unexpected, or contradicts consensus.

Return ONLY valid JSON, no markdown, no citation tags, no bracket references. All text fields must be plain readable sentences:
{
  "signals": [
    {
      "id": "sig1",
      "domain": "Middle East|Indo-Pacific|Europe|Americas|Africa|Energy|Technology|US Politics",
      "headline": "concise factual headline in plain text",
      "significance": "CRITICAL|HIGH|MEDIUM|LOW",
      "summary": "2-3 sentence factual summary in plain text",
      "signal": "non-obvious strategic implication for US interests in plain text",
      "contradicts": "conventional wisdom this challenges in plain text, or null"
    }
  ],
  "scanNote": "one sentence on what you searched and signal quality"
}` }], 2500);
    const parsed = parseJSON(extractText(data));
    output.signals = (parsed.signals || []).map((s, i) => ({ ...s, id: s.id || `sig${i+1}`, timestamp: new Date().toISOString() }));
    output.scanNote = parsed.scanNote;
    console.log(`  Done: ${output.signals.length} signals`);
  } catch (e) {
    console.error(`  Failed: ${e.message}`);
  }

  // STEP 3 — WATCH LIST + GROUND TRUTH
  console.log("\nStep 3/4: Watch list and ground truth...");
  try {
    const data = await callClaude([{ role: "user", content: `Based on current global conditions as of ${today}, identify:
1. The 6 most important specific observable things to watch over the next 2-4 weeks from a US strategic perspective
2. The 5 most important established facts across different global domains right now

Return ONLY valid JSON, no markdown, no citation tags, all plain text:
{
  "watchSignals": [
    "specific observable trigger or development to watch 1",
    "specific observable trigger or development to watch 2",
    "specific observable trigger or development to watch 3",
    "specific observable trigger or development to watch 4",
    "specific observable trigger or development to watch 5",
    "specific observable trigger or development to watch 6"
  ],
  "groundTruth": [
    {
      "id": "gt1",
      "domain": "domain name",
      "headline": "most important established fact",
      "significance": "CRITICAL|HIGH",
      "summary": "2-3 sentence factual summary in plain text",
      "signal": "strategic implication for US in plain text"
    }
  ]
}` }], 2000);
    const parsed = parseJSON(extractText(data));
    output.watchSignals = parsed.watchSignals || [];
    output.groundTruth = parsed.groundTruth || [];
    console.log(`  Done: ${output.watchSignals.length} watch signals, ${output.groundTruth.length} ground truth`);
  } catch (e) {
    console.error(`  Failed: ${e.message}`);
  }

  // STEP 4 — MARKETS
  console.log("\nStep 4/4: Prediction markets...");
  output.markets = await Promise.all(
    POLY_MARKETS.map(async (m) => {
      const pd = await fetchPolymarket(m.slug);
      const gap = pd?.yesProb != null ? m.aiProb - pd.yesProb : null;
      return { aiKey: m.aiKey, label: m.label, domain: m.domain, slug: m.slug, marketProb: pd?.yesProb ?? null, aiProb: m.aiProb, gap, confidence: m.confidence, rationale: m.rationale, volume24h: pd?.volume24h ?? null, url: pd?.url ?? `https://polymarket.com/event/${m.slug}` };
    })
  );
  console.log(`  Done: ${output.markets.filter(m => m.marketProb != null).length}/${POLY_MARKETS.length} live prices`);

  // WRITE
  const clean = stripCites(output);
  fs.writeFileSync(outPath, JSON.stringify(clean, null, 2));
  console.log(`\n=== COMPLETE: Run #${clean.runNumber} ===`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
