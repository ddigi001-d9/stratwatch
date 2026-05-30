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

module.exports = { KALSHI_BASE, RELEVANT_CATEGORIES, parseFp, marketFields };
