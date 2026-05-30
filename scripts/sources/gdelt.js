const { httpGet } = require("../lib/http");

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

// Tuned per-theater queries — generic queries return noise, so constrain by theme terms + English.
const THEATER_QUERIES = [
  { theater: "Middle East", query: "(Iran OR Israel OR Gaza OR \"Red Sea\" OR Hormuz OR Lebanon) sourcelang:eng" },
  { theater: "Indo-Pacific", query: "(China OR Taiwan OR \"South China Sea\" OR \"North Korea\" OR Philippines) sourcelang:eng" },
  { theater: "Europe", query: "(Ukraine OR Russia OR NATO OR Putin OR Baltic) sourcelang:eng" },
  { theater: "Energy", query: "(oil OR \"crude\" OR OPEC OR \"natural gas\" OR LNG OR pipeline) sourcelang:eng" },
  { theater: "Americas", query: "(Venezuela OR Mexico OR \"Latin America\" OR cartel OR Panama) sourcelang:eng" },
];

function normalizeArticles(json, cap = 8) {
  const arts = (json && json.articles) || [];
  return arts.slice(0, cap).map((a) => ({ title: a.title || "", domain: a.domain || "" }));
}

function buildUrl(query) {
  const q = encodeURIComponent(query);
  return `${GDELT_BASE}?query=${q}&mode=artlist&maxrecords=8&timespan=48h&sort=hybridrel&format=json`;
}

// GDELT rate-limits (~1 req / 5s). Fetch theaters sequentially with a delay; tolerate failures.
async function fetchGdelt() {
  const results = [];
  for (const { theater, query } of THEATER_QUERIES) {
    try {
      const json = await httpGet(buildUrl(query), { json: true, timeoutMs: 20000 });
      results.push({ theater, articles: normalizeArticles(json, 8) });
    } catch (e) {
      results.push({ theater, articles: [] });
    }
    await new Promise((r) => setTimeout(r, 5500)); // respect GDELT rate limit
  }
  return results;
}

module.exports = { GDELT_BASE, THEATER_QUERIES, normalizeArticles, buildUrl, fetchGdelt };
