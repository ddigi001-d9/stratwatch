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

// The feed renders one card per report: <div id="osint-markets-<id>"> ... <a x.com link> ...
// "<handle> <HH:MM> Z <report text> locating…" </div>. We bound each report to its card,
// strip tags, and extract the text after the timestamp (the report body follows the link,
// not precedes it). Account comes from the tweet link's handle.
function parseOsintFeed(html) {
  const cardRe = /id="osint-markets-(\d+)"/g;
  const starts = [];
  let c;
  while ((c = cardRe.exec(html)) !== null) starts.push(c.index);

  const reports = [];
  const seen = new Set();
  for (let i = 0; i < starts.length; i++) {
    const chunk = html.slice(starts[i], starts[i + 1] ?? starts[i] + 2500);
    const link = chunk.match(/x\.com\/(\w+)\/status\/(\d+)/);
    if (!link) continue;
    const [, account, id] = link;
    if (seen.has(id)) continue;
    seen.add(id);

    let text = stripTags(chunk);
    const tz = text.match(/\d{1,2}:\d{2}\s*Z\s*/); // skip the "HH:MM Z" timestamp prefix
    if (tz) text = text.slice(tz.index + tz[0].length);
    text = text
      .replace(new RegExp("^" + account + "\\s+", "i"), "") // drop a repeated handle
      .replace(/\s*locating….*$/i, "")
      .split("<")[0] // cut any dangling partial tag from the card-boundary slice
      .trim()
      .slice(0, 280)
      .trim();
    if (text) reports.push({ account, url: `https://x.com/${account}/status/${id}`, text });
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
