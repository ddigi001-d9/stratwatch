const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { extractHeadlines } = require("../sources/drudge");

const HTML = fs.readFileSync(path.join(__dirname, "fixtures/drudge.html"), "utf8");

test("extractHeadlines returns deduped, capped headline strings", () => {
  const heads = extractHeadlines(HTML, { cap: 80 });
  assert.ok(heads.length > 10, `expected many headlines, got ${heads.length}`);
  assert.ok(heads.length <= 80);
  assert.strictEqual(new Set(heads).size, heads.length, "should be deduped");
  for (const h of heads) assert.ok(h.length >= 15);
});

test("extractHeadlines does not leak inline script/JS blobs", () => {
  const heads = extractHeadlines(HTML, { cap: 80 });
  for (const h of heads) {
    assert.ok(!/WebSocket|function\s*\(|=>|const\s+\w+\s*=/.test(h), `code leaked into headline: ${h.slice(0, 60)}`);
  }
});
