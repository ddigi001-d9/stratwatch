// STRATWATCH Intelligence Runner
// Runs in GitHub Actions — API key from env, never touches the frontend
// Writes all output to ../docs/intelligence.json

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY environment variable not set");
  process.exit(1);
}

// ── GROUND TRUTH & PRIORS ────────────────────────────────────────────────────
const SEED = {
  groundTruth: [
    { id: "gt1", domain: "Iran", headline: "Khamenei Confirmed Dead", significance: "CRITICAL", summary: "Killed in Feb 28 US-Israeli strikes. Internet at 1%. Protests reigniting in Ilam.", signal: "Succession vacuum + protest resurgence = regime stress test begins NOW." },
    { id: "gt2", domain: "Iran", headline: "30,000+ Dead in Jan Crackdown", significance: "CRITICAL", summary: "Monitors: 7,000–32,000 killed. Security forces raided hospitals to execute wounded.", signal: "Regime survived through mass violence. Khamenei death changes every variable." },
    { id: "gt3", domain: "Trade/Legal", headline: "SCOTUS Kills IEEPA Tariffs", significance: "HIGH", summary: "Feb 20 ruling strips IEEPA authority. $133.5B may need refunding. China truce to Nov 10.", signal: "Tariff legal foundation shifted. Xi Summit timing now critical." },
    { id: "gt4", domain: "Domestic Politics", headline: "Dems +16pts in Specials", significance: "HIGH", summary: "Fort Worth TX: 31-pt swing. 30 GOP retiring. Cook moved 18 seats toward Dems.", signal: "House majority in serious jeopardy. Strategy runway at risk." },
    { id: "gt5", domain: "China", headline: "China 15th FYP: Strategic Autarky", significance: "HIGH", summary: "Cut tariffs on 935 high-tech inputs. Record $1.2T surplus. Rare earth controls to Nov 10.", signal: "China building resilience, not capitulating." },
    { id: "gt6", domain: "Geopolitics", headline: "NSS: US Seeks EU Fragmentation", significance: "HIGH", summary: "First NSS openly targeting EU political trajectory. Europe accelerating independent defense.", signal: "Declared adversarial intent toward ally. NATO fracture is structural." },
  ],
  watchSignals: [
    "Who fills Khamenei succession — IRGC hardliner or reformist?",
    "Does IRGC splinter or close ranks after decapitation?",
    "China's response to Iran strikes — how strong?",
    "Republican retirement gap — does 30-21 widen?",
    "Oil markets reacting to Iranian chaos?",
    "Cuba economic collapse signals as Venezuela oil cuts?",
    "April Xi Summit prep — concession vs hardline?",
    "Section 122 tariff legal challenges?",
  ]
};

const AI_PRIORS = {
  iran_regime:       { prob: 62, rationale: "Khamenei death + IRGC succession vacuum + protest resurgence. Security forces still nominally cohesive but structural crisis beginning.", confidence: "MEDIUM" },
  house_gop:         { prob: 28, rationale: "+16pt special election overperformance, 30 GOP retirements, 42% approval. Historical patterns confirm House flip is base case.", confidence: "HIGH" },
  china_deal:        { prob: 35, rationale: "IEEPA ruling weakened leverage. China building autarky. November truce expiry forces confrontation, not resolution.", confidence: "MEDIUM" },
  oil_spike:         { prob: 71, rationale: "Khamenei death + Hormuz threat premium + 1.3M bbl/day Iranian supply at risk. Supply shock scenario elevated.", confidence: "MEDIUM" },
  ukraine_ceasefire: { prob: 41, rationale: "Trump wants exit. Ukraine exhausted. Europe pushing. Russia sees no urgency while winning slowly.", confidence: "LOW" },
  trump_approval:    { prob: 18, rationale: "Currently 42%, declining. Iran strikes alienating isolationists. No structural path to 50%+ visible.", confidence: "HIGH" },
};

const POLY_MARKETS = [
  { label: "Iran Regime Change", slug: "will-irans-government-change-in-2026", aiKey: "iran_regime", domain: "Iran" },
  { label: "GOP Keeps House",    slug: "will-republicans-keep-the-house-in-2026", aiKey: "house_gop", domain: "Domestic Politics" },
  { label: "US-China Trade Deal",slug: "will-us-and-china-reach-a-trade-deal-in-2026", aiKey: "china_deal", domain: "China" },
  { label: "Oil >$100/bbl",      slug: "will-oil-price-exceed-100-per-barrel-in-2026", aiKey: "oil_spike", domain: "Energy" },
  { label: "Ukraine Ceasefire",  slug: "will-russia-ukraine-ceasefire-be-reached-in-2026", aiKey: "ukraine_ceasefire", domain: "Geopolitics" },
  { label: "Trump Approval >50%",slug: "will-trump-job-approval-exceed-50-percent-by-june-2026", aiKey: "trump_approval", domain: "Domestic Politics" },
];

const SYSTEM_PROMPT = `You are STRATWATCH — an adaptive geopolitical intelligence AI. You search for current evidence, find non-obvious cross-domain patterns, and assign explicit probability estimates. You flag uncertainty. You never speculate without evidence.

GROUND TRUTH (March 1, 2026 baseline):
${SEED.groundTruth.map(g => `${g.domain}: ${g.headline} — ${g.signal}`).join("\n")}

AI PROBABILITY PRIORS:
${Object.entries(AI_PRIORS).map(([k, v]) => `${k}: ${v.prob}% (${v.confidence} confidence) — ${v.rationale}`).join("\n")}

MANDATE: Search first. Identify what most analysts are missing. Update priors based on new evidence. Return structured JSON only when requested.`;

// ── CLAUDE API CALL ───────────────────────────────────────────────────────────
async function callClaude(messages, maxTokens = 2000) {
  console.log(`  → Calling Claude (${maxTokens} tokens)...`);
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }
  return res.json();
}

function extractText(data) {
  return (data?.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in response");
  return JSON.parse(match[0]);
}

// ── POLYMARKET FETCH ──────────────────────────────────────────────────────────
async function fetchPolymarket(slug) {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}&active=true`,
      { headers: { Accept: "application/json" }, timeout: 8000 }
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
    return {
      yesProb,
      volume24h: market.volume24hr ? parseFloat(market.volume24hr) : null,
      liquidity: market.liquidity ? parseFloat(market.liquidity) : null,
      question: market.question,
      url: `https://polymarket.com/event/${slug}`,
    };
  } catch (e) {
    console.warn(`  ! Polymarket fetch failed for ${slug}: ${e.message}`);
    return null;
  }
}

// ── MAIN INTELLIGENCE GATHERING ───────────────────────────────────────────────
async function gatherIntelligence() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║      STRATWATCH INTELLIGENCE RUN             ║");
  console.log(`║      ${new Date().toISOString()}        ║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  const output = {
    generatedAt: new Date().toISOString(),
    runNumber: null, // filled below
    situation: null,
    signals: [],
    markets: [],
    watchSignals: SEED.watchSignals,
    groundTruth: SEED.groundTruth,
  };

  // ── 1. SITUATION ASSESSMENT ──────────────────────────────────────────────────
  console.log("Step 1/3: Generating situation assessment...");
  try {
    const data = await callClaude([{
      role: "user",
      content: `Search for the latest developments on: Iran succession crisis, US midterm political environment, China response to Iran strikes, oil market reaction, US-China summit preparations, Venezuela/Cuba. Today is ${new Date().toDateString()}.

Return ONLY valid JSON, no markdown:
{
  "headline": "single most important thing happening right now",
  "velocity": "ACCELERATING|STABLE|DECELERATING",
  "domains": [
    {"name": "Iran", "prob": 0, "label": "regime collapse 90d", "trajectory": "UP|DOWN|FLAT", "status": "1-sentence current state"},
    {"name": "US Politics", "prob": 0, "label": "House flip Nov 26", "trajectory": "UP|DOWN|FLAT", "status": "1-sentence current state"},
    {"name": "Energy", "prob": 0, "label": "oil shock 60d", "trajectory": "UP|DOWN|FLAT", "status": "1-sentence current state"},
    {"name": "US-China", "prob": 0, "label": "deal at April summit", "trajectory": "UP|DOWN|FLAT", "status": "1-sentence current state"},
    {"name": "Geopolitics", "prob": 0, "label": "NATO cohesion degradation", "trajectory": "UP|DOWN|FLAT", "status": "1-sentence current state"}
  ],
  "unseen": "the most non-obvious pattern most analysts are missing right now",
  "criticalWindow": "the single most time-sensitive decision point in the next 30-90 days",
  "watchFor": ["specific trigger 1", "specific trigger 2", "specific trigger 3", "specific trigger 4"],
  "confidenceNote": "honest statement of analytical uncertainty",
  "topPattern": "one sentence — the cross-domain pattern connecting the most important dots"
}`
    }], 2000);
    output.situation = parseJSON(extractText(data));
    console.log(`  ✓ Situation: "${output.situation.headline?.slice(0, 60)}..."`);
  } catch (e) {
    console.error(`  ✗ Situation failed: ${e.message}`);
    output.situation = { headline: "Assessment unavailable", error: e.message };
  }

  // ── 2. SIGNAL SCAN ───────────────────────────────────────────────────────────
  console.log("\nStep 2/3: Scanning for new signals...");
  try {
    const data = await callClaude([{
      role: "user",
      content: `Search for the most significant geopolitical developments from the last 12 hours. Focus on: Iran succession, US politics, China-US relations, energy markets, military movements, economic data. Today is ${new Date().toDateString()}.

Return ONLY valid JSON:
{
  "signals": [
    {
      "id": "unique_id",
      "domain": "Iran|China|Domestic Politics|Energy|Geopolitics|Trade",
      "headline": "concise factual headline",
      "significance": "CRITICAL|HIGH|MEDIUM|LOW",
      "summary": "2-3 sentence factual summary",
      "signal": "non-obvious strategic implication — what this means that most analysts aren't saying",
      "contradicts": "conventional wisdom this challenges, or null",
      "timestamp": "${new Date().toISOString()}"
    }
  ],
  "scanNote": "brief note on signal quality and sources"
}`
    }], 2000);
    const parsed = parseJSON(extractText(data));
    output.signals = (parsed.signals || []).map(s => ({ ...s, id: s.id || Math.random().toString(36).slice(2, 8) }));
    output.scanNote = parsed.scanNote;
    console.log(`  ✓ Found ${output.signals.length} signals`);
  } catch (e) {
    console.error(`  ✗ Signal scan failed: ${e.message}`);
    output.signals = SEED.groundTruth;
  }

  // ── 3. MARKET DATA + DIVERGENCE ──────────────────────────────────────────────
  console.log("\nStep 3/3: Fetching prediction market data...");
  const marketResults = await Promise.all(
    POLY_MARKETS.map(async (m) => {
      const pd = await fetchPolymarket(m.slug);
      const prior = AI_PRIORS[m.aiKey];
      const gap = pd?.yesProb != null && prior ? prior.prob - pd.yesProb : null;
      return {
        aiKey: m.aiKey,
        label: m.label,
        domain: m.domain,
        slug: m.slug,
        marketProb: pd?.yesProb ?? null,
        aiProb: prior?.prob ?? null,
        gap,
        confidence: prior?.confidence,
        rationale: prior?.rationale,
        volume24h: pd?.volume24h ?? null,
        url: pd?.url ?? `https://polymarket.com/event/${m.slug}`,
      };
    })
  );
  output.markets = marketResults.sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0));

  const withData = marketResults.filter(m => m.marketProb != null);
  console.log(`  ✓ Got prices for ${withData.length}/${POLY_MARKETS.length} markets`);

  // ── WRITE OUTPUT ─────────────────────────────────────────────────────────────
  const outPath = path.join(__dirname, "..", "docs", "intelligence.json");

  // Load previous run to increment run number
  let runNumber = 1;
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, "utf8"));
    runNumber = (prev.runNumber || 0) + 1;
  } catch (_) {}
  output.runNumber = runNumber;

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written to docs/intelligence.json (run #${runNumber})`);
  console.log(`  Signals: ${output.signals.length}`);
  console.log(`  Markets with data: ${withData.length}`);
  console.log(`  Generated: ${output.generatedAt}`);
}

gatherIntelligence().catch(e => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
