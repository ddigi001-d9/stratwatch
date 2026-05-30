// Shared HTTP helper. node-fetch v2 supports a `timeout` option natively.
const fetch = require("node-fetch");

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// GET a URL with a browser UA. Returns parsed JSON when json=true, else text.
async function httpGet(url, { json = false, timeoutMs = 15000, headers = {} } = {}) {
  const res = await fetch(url, {
    timeout: timeoutMs,
    headers: { "User-Agent": BROWSER_UA, Accept: json ? "application/json" : "*/*", ...headers },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return json ? res.json() : res.text();
}

module.exports = { BROWSER_UA, httpGet };
