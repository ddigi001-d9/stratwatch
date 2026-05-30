const { httpGet } = require("../lib/http");

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const RELEVANT_CATEGORIES = ["World", "Politics", "Elections", "Economics", "Financials"];

// Kalshi numeric fields arrive as strings ("_fp" fixed-point or "_dollars"). Parse defensively.
function parseFp(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Normalize one raw Kalshi market into the fields STRATWATCH uses.
function marketFields(m, { category = null, eventTicker = null } = {}) {
  const last = parseFp(m.last_price_dollars);
  const prev = parseFp(m.previous_price_dollars);
  const title = [m.title, m.yes_sub_title].filter(Boolean).join(" — ");
  return {
    ticker: m.ticker,
    title,
    marketProb: last === null ? null : Math.round(last * 100), // 0-100 like Polymarket marketProb
    priceChange24h: last === null || prev === null ? null : Math.round((last - prev) * 100), // cents
    volume24h: Math.round(parseFp(m.volume_24h_fp) ?? 0),
    openInterest: Math.round(parseFp(m.open_interest_fp) ?? 0),
    liquidity: parseFp(m.liquidity_dollars),
    category,
    eventTicker,
    url: `https://kalshi.com/markets/${m.ticker}`,
  };
}

function filterRelevant(events) {
  return (events || []).filter((e) => RELEVANT_CATEGORIES.includes(e.category));
}

function flatten(events) {
  const out = [];
  for (const e of events || []) {
    for (const m of e.markets || []) {
      out.push(marketFields(m, { category: e.category, eventTicker: e.event_ticker }));
    }
  }
  return out;
}

// Drop fully-inactive markets (no volume and no open interest), sort by 24h volume, cap.
function rankMarkets(markets, { cap = 50 } = {}) {
  return (markets || [])
    .filter((m) => (m.volume24h || 0) > 0 || (m.openInterest || 0) > 0)
    .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    .slice(0, cap);
}

// Pure: events array -> ranked catalog (used by both fetch and tests).
function catalogFromEvents(events, { cap = 50 } = {}) {
  return rankMarkets(flatten(filterRelevant(events)), { cap });
}

// Network: paginate open events with nested markets, then build the catalog.
async function fetchKalshiCatalog({ cap = 50, maxPages = 6 } = {}) {
  let cursor = "";
  let events = [];
  for (let i = 0; i < maxPages; i++) {
    const url =
      `${KALSHI_BASE}/events?limit=200&status=open&with_nested_markets=true` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const data = await httpGet(url, { json: true });
    events = events.concat(data.events || []);
    cursor = data.cursor;
    if (!cursor) break;
  }
  return catalogFromEvents(events, { cap });
}

// --- Authenticated (FUTURE SEAM — weather-engine integration). Not used yet. ---
function fetchPositions() {
  throw new Error("Kalshi authenticated endpoints not implemented yet");
}
function placeOrder() {
  throw new Error("Kalshi authenticated endpoints not implemented yet");
}

module.exports = { KALSHI_BASE, RELEVANT_CATEGORIES, parseFp, marketFields, filterRelevant, flatten, rankMarkets, catalogFromEvents, fetchKalshiCatalog, fetchPositions, placeOrder };
