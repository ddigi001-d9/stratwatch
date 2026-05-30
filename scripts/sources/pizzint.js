const { httpGet } = require("../lib/http");

const PIZZINT_URL = "https://www.pizzint.watch/";

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Each OSINT card contains report text followed by a link to the original tweet.
// Heuristic: for each x.com status link, take the stripped text in the preceding window.
function parseOsintFeed(html) {
  const re = /<a[^>]+href="https:\/\/x\.com\/(\w+)\/status\/(\d+)"/g;
  const reports = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, account, id] = m;
    if (seen.has(id)) continue;
    seen.add(id);
    const before = html.slice(Math.max(0, m.index - 900), m.index);
    const text = stripTags(before).slice(-240).trim();
    reports.push({ account, url: `https://x.com/${account}/status/${id}`, text });
  }
  return reports;
}

// "DOUGHCON 4 DOUBLE TAKE" -> { level: 4, label: "DOUBLE TAKE" }
function parseDoughcon(html) {
  const text = stripTags(html);
  const m = text.match(/DOUGHCON\s+(\d)\s+([A-Z][A-Z ]*?)(?:\s+•|\s+INCREASED|\s+SUPPORT|$)/);
  if (!m) return { level: null, label: null };
  return { level: Number(m[1]), label: m[2].trim() };
}

async function fetchPizzint() {
  const html = await httpGet(PIZZINT_URL);
  return { reports: parseOsintFeed(html), doughcon: parseDoughcon(html) };
}

module.exports = { PIZZINT_URL, stripTags, parseOsintFeed, parseDoughcon, fetchPizzint };
