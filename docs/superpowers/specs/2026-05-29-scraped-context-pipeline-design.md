# STRATWATCH — Intel-Driven, Market-Aware Pipeline Redesign

**Date:** 2026-05-29
**Status:** Approved design, pending implementation plan

## Problem

Two issues in `scripts/run.js`:

1. **Cost:** 3 Claude calls each enable the `web_search` tool. Search drives
   cost via per-search fees and large search-result payloads inflating input
   tokens. Result: ~$3 per run.
2. **Dead markets:** Step 4 fetches 6 hardcoded Polymarket slugs that have all
   resolved/changed — every market currently returns `marketProb: null`. The
   markets section is empty in the published JSON.

## Vision

STRATWATCH gathers intelligence, looks forward, assigns probabilities to future
events, compares those to live prediction markets (which are themselves intel),
and surfaces where its view diverges from real-money pricing — the seed of an
eventual workflow that buys favorable contracts on Kalshi (rolling into the
user's existing weather Kalshi engine).

## Goals

- Remove the `web_search` tool; reason over pre-scraped intel instead. Target
  **~$0.15–0.40/run** (down from ~$3).
- Replace dead hardcoded Polymarket with **dynamic, intel-driven Kalshi market
  discovery**: the news determines which markets matter, not a static list.
- Treat prediction markets as a first-class **intel source** (price action,
  volume, open interest) feeding the narrative, plus a **trade-edge** output
  (AI probability vs market price → gap → favorable-contract flag).

## Non-Goals

- No change to the published JSON **shape** that `docs/index.html` consumes
  (changes are additive only).
- No change to the cron schedule (`intelligence.yml`).
- No authenticated Kalshi (positions / order placement) yet — left as a seam.

## Pipeline

### Step 0 — Source Collection → shared `CONTEXT`

Runs before the Claude calls and assembles one shared `CONTEXT` string. Each
fetch is wrapped in `try/catch`; one source failing does not abort the run.

| Source | Method | Yields |
|---|---|---|
| **Drudge Report** | `node-fetch` + browser User-Agent, strip tags | ~60–100 headlines across politics / international / economics / tech |
| **PizzINT** (pizzint.watch) | `node-fetch` + browser UA; parse server-rendered OSINT feed cards + DOUGHCON level | ~33 OSINT reports (military movements) + Pentagon-pizza activity level |
| **GDELT DOC 2.0** | JSON API, ~5 tuned per-theater queries | Global article headlines per theater |
| **Kalshi catalog** | Public `/events` API, paginated | Live geopolitical markets with price action, volume, open interest |

The four blocks are concatenated under clear headers into `CONTEXT`, each block
truncated to a sane cap so input tokens stay bounded.

#### Source notes / risks

- **PizzINT requires a browser User-Agent** (default fetch UA is 403'd). OSINT
  feed is server-rendered but interleaved with heavy SVG/markup — **this parser
  is the most brittle part of the system**. Extract feed-card text + the
  `x.com/.../status/...` source links; degrade gracefully on structure change.
- **GDELT raw queries return noise.** Useful output needs **tuned queries**
  (`theme:` / `sourcelang:eng` + per-theater terms), `mode=artlist&format=json`,
  titles + domains, record caps.
- **Kalshi quirks:** needs browser UA; `/series` 301-redirects without trailing
  slash; numeric fields are mixed-type strings (`volume_24h_fp`,
  `open_interest_fp`, `*_dollars`) — parse defensively. Relevant categories:
  World, Politics, Elections, Economics, Financials.

#### Kalshi catalog extraction (Step 0, prediction-market intel)

- Paginate `GET /trade-api/v2/events?status=open&with_nested_markets=true`
  (follow cursor), keep events whose `category` ∈ {World, Politics, Elections,
  Economics, Financials}.
- Flatten to markets; drop illiquid ones (below a volume/open-interest
  threshold); rank by 24h volume; cap to top ~40–60.
- Per market, capture: `ticker`, title, last price, **24h price change**
  (`last_price` vs `previous_price`), 24h volume, **open interest**, liquidity,
  event/category.
- Format as a `=== PREDICTION-MARKET ACTION ===` block in `CONTEXT` so the
  narrative steps can reason over money moving (e.g. "open interest on a
  Russia-escalation contract jumped, price +12¢").

### Claude calls — shared context, prompt-cached, tiered models

All calls drop the `tools` array and `web-search` beta header, prepend the
shared `CONTEXT`, and mark the `CONTEXT` block with
`cache_control: {type: "ephemeral"}` so repeated reads bill at ~10% input cost.
`callClaude` takes a `model` argument (replacing the single `MODEL` constant).

| Step | Purpose | Model |
|---|---|---|
| 1 — Situation | Cross-domain synthesis, "what analysts miss", probabilities — reasons over news **+ market action** | `claude-sonnet-4-6` |
| 2 — Signals | Read context, structure 5–7 signals | `claude-haiku-4-5-20251001` |
| 3 — Watch + Ground Truth | Read context, structure watch list + facts | `claude-haiku-4-5-20251001` |
| 4 — Market Edge | Select most-relevant live Kalshi markets, assign STRATWATCH probability + gap + favorable flag | `claude-sonnet-4-6` |

Prompt caching: the two Sonnet calls share a cache; the two Haiku calls share a
cache (same model + identical context prefix).

### Step 4 — Market Edge (replaces hardcoded Polymarket)

Given the intel **and** the live Kalshi catalog already in `CONTEXT`, Claude:

1. Selects the markets most relevant to the current situation (semantic match,
   not keyword) — "smart reference to active markets based on current events."
2. Assigns STRATWATCH's own forward probability with rationale + confidence.
3. Reports the live market price and computes `gap = aiProb − marketProb`.
4. Flags **favorable contracts**: large `|gap|` × high confidence.

**Output `markets` array** preserves existing keys consumed by the frontend
(`label, domain, marketProb, aiProb, gap, confidence, rationale, volume24h,
url`) and adds optional fields (`ticker, openInterest, priceChange24h,
favorable`). `index.html` keeps working unchanged; new fields are additive.

Polymarket: the dead hardcoded call is **removed**. May be re-added later with
fresh slugs if cross-market disagreement signal is wanted.

## Cost Outcome

- **Today:** 3 calls × web_search (fees + inflated input) ≈ **$3/run**.
- **After:** 2 Sonnet (Steps 1, 4) + 2 Haiku (Steps 2, 3), no search, shared
  cached context ≈ **~$0.15–0.40/run**.

## Future Seam (note — not building now)

Kalshi module splits public market-data (`fetchKalshiCatalog()`, used now) from
authenticated endpoints (`fetchPositions()`, `placeOrder()`, stubbed) so the
geopolitical edge can later roll into the user's weather Kalshi engine. The
Kalshi token sits as a ready-but-unused GitHub secret.

## Trade-offs (accepted)

1. **Coverage narrows** to what Drudge / PizzINT / GDELT / Kalshi surface daily.
   No longer "search anything."
2. **Brittleness** — PizzINT (unversioned React site) and Kalshi field shapes
   can change. Mitigated by try/catch + graceful degradation; needs occasional
   maintenance.
3. **Haiku depth** on Steps 2–3 is shallower than Sonnet — acceptable, those
   steps are extraction, not synthesis.

## Testing

- Run `scripts/run.js` locally with a real `ANTHROPIC_API_KEY`; confirm
  `docs/intelligence.json` has all sections populated with the existing schema
  the frontend consumes, and a non-empty live `markets` array.
- Verify each source fetch independently (log per-source item counts); confirm
  killing any one source still yields a valid run.
- Confirm no `web_search` in any request, `cache_control` set, and Step 4 emits
  `gap` + `favorable` flags against real Kalshi prices.
