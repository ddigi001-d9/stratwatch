const { httpGet } = require("../lib/http");

const DRUDGE_URL = "https://drudgereport.com/";

// Drudge headlines are anchor texts. Keep substantial, mostly-text anchor labels.
function extractHeadlines(html, { cap = 80 } = {}) {
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 15) continue;            // skip nav/short links
    if (/^https?:\/\//i.test(text)) continue;  // skip bare URLs
    const key = text.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

async function fetchDrudge() {
  const html = await httpGet(DRUDGE_URL);
  return extractHeadlines(html, { cap: 80 });
}

module.exports = { DRUDGE_URL, extractHeadlines, fetchDrudge };
