# STRATWATCH — Scraped-Context Pipeline Redesign

**Date:** 2026-05-29
**Status:** Approved design, pending implementation plan

## Problem

The intelligence runner (`scripts/run.js`) makes 3 Claude calls, each with the
`web_search` tool enabled. Web search drives cost two ways: per-search fees and
large search-result payloads inflating input tokens. Result: ~$3 per run.

## Goal

Remove the `web_search` tool entirely. Feed Claude pre-scraped intel from three
free sources and have it reason over that. Target: **~$0.10–0.30/run or lower**
(roughly a 10× cut), with a tiered model strategy pushing it toward cents.

## Non-Goals

- No changes to `docs/index.html` or the published JSON **shape**.
- No change to the cron schedule (`intelligence.yml`).
- No change to the Polymarket step (Step 4).

## Sources

A new **Step 0 — Source Collection** runs before the Claude calls and assembles
one shared `CONTEXT` string. Each fetch is wrapped in `try/catch`; if one source
fails, the run continues with the others (matches existing fault tolerance).

| Source | Method | Yields |
|---|---|---|
| **Drudge Report** | `node-fetch` + browser User-Agent, strip tags to text | ~60–100 headlines across politics / international / economics / tech |
| **PizzINT** (pizzint.watch) | `node-fetch` + browser User-Agent; parse the server-rendered OSINT feed cards + DOUGHCON level | ~33 OSINT reports (military movements) from named accounts, plus Pentagon-pizza activity level |
| **GDELT DOC 2.0** | JSON API, ~5 tuned per-theater queries | Global article headlines per theater (Middle East, Indo-Pacific, Europe/Russia, Energy, Americas) |

### Source notes / risks

- **PizzINT requires a browser User-Agent** — the default fetch UA is 403'd. The
  OSINT feed is server-rendered into the HTML but interleaved with heavy SVG/
  markup. **This parser is the most brittle part of the system** and the most
  likely thing to break on a site redesign. Extract feed-card text + the
  `x.com/.../status/...` source links; degrade gracefully if structure changes.
- **GDELT raw queries return noise** (generic queries surfaced product outages
  and quote-of-the-day items). Useful output requires **tuned queries** using
  `theme:`/`sourcelang:eng` operators and per-theater terms. This is the real
  engineering work in the change. Pull `mode=artlist&format=json`, take titles +
  domains, cap record counts to keep the context bounded.

### CONTEXT assembly

Concatenate the three source blocks under clear headers, e.g.:

```
=== DRUDGE HEADLINES ===
...
=== PIZZINT OSINT FEED (DOUGHCON level: N) ===
...
=== GDELT GLOBAL WIRE (by theater) ===
...
```

Bound total size (truncate each block to a sane cap) so input tokens stay
predictable.

## Claude Calls

Keep the existing **3-step structure** and the **exact same output JSON shape**
so the frontend needs zero changes. Per call:

- Remove the `tools` array and the `anthropic-beta: web-search-...` header.
- Prepend the shared `CONTEXT` block to the user prompt.
- Mark the `CONTEXT` block with `cache_control: {type: "ephemeral"}` so repeated
  reads across same-model calls bill at ~10% input cost.

### Tiered models

| Step | Purpose | Model |
|---|---|---|
| 1 — Situation | Cross-domain pattern synthesis, "what analysts miss", probability estimates — the genuine reasoning step | `claude-sonnet-4-6` |
| 2 — Signals | Read context, structure 5–7 signals | `claude-haiku-4-5-20251001` |
| 3 — Watch + Ground Truth | Read context, structure watch list + facts | `claude-haiku-4-5-20251001` |
| 4 — Markets (Polymarket) | unchanged, no Claude | n/a |

Prompt caching benefits the two Haiku calls (same model + identical context
prefix → shared cache). The Sonnet call caches independently.

`callClaude` is updated to take a `model` argument (replacing the single `MODEL`
constant) and to omit the search tool/header.

## Cost Outcome

- **Today:** 3 calls × web_search (search fees + inflated input) ≈ **$3/run**.
- **After:** Step 1 Sonnet + Steps 2–3 Haiku, no search, cached shared context
  ≈ **low single-digit cents to ~$0.30/run**.

## Trade-offs (accepted)

1. **Coverage narrows** to what these 3 sources surface daily. Drudge skews
   US-tabloid, PizzINT skews kinetic/military, GDELT backfills global. No longer
   "search anything."
2. **Brittleness** — PizzINT is an unversioned React site; a redesign breaks the
   parser. Mitigated by try/catch + graceful degradation; needs occasional
   maintenance.
3. **Haiku depth** — Steps 2–4 analysis is shallower than Sonnet, acceptable
   because those steps are extraction/summarization, not synthesis.

## Testing

- Run `scripts/run.js` locally with a real `ANTHROPIC_API_KEY`; confirm
  `docs/intelligence.json` is produced with all sections populated and the same
  schema the frontend consumes.
- Verify each source fetch independently (log per-source item counts) and that
  killing any one source still yields a valid run.
- Confirm no `web_search` is present in any request and `cache_control` is set.
