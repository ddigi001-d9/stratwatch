const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { parseOsintFeed, parseDoughcon } = require("../sources/pizzint");

const HTML = fs.readFileSync(path.join(__dirname, "fixtures/pizzint.html"), "utf8");

test("parseOsintFeed extracts reports with account + source link", () => {
  const reports = parseOsintFeed(HTML);
  assert.ok(reports.length >= 5, `expected several reports, got ${reports.length}`);
  const r = reports[0];
  assert.ok(typeof r.account === "string" && r.account.length > 0);
  assert.match(r.url, /x\.com\/.+\/status\/\d+/);
  assert.ok(typeof r.text === "string");
});

test("parseOsintFeed text is clean — no markup, class-soup, or timestamp prefix", () => {
  const reports = parseOsintFeed(HTML);
  for (const r of reports) {
    assert.ok(!/[<>]|jsx-|text-gray|font-mono|class=/.test(r.text), `markup leaked: ${r.text.slice(0, 60)}`);
    assert.ok(!/^\d{1,2}:\d{2}\s*Z/.test(r.text), `timestamp not stripped: ${r.text.slice(0, 30)}`);
    assert.ok(r.text.length >= 10, `report too short: "${r.text}"`);
  }
});

test("parseOsintFeed attributes reports to multiple distinct accounts", () => {
  const reports = parseOsintFeed(HTML);
  const accounts = new Set(reports.map((r) => r.account));
  assert.ok(accounts.size >= 3, `expected varied attribution, got: ${[...accounts].join(",")}`);
});

test("parseDoughcon extracts numeric level", () => {
  const d = parseDoughcon(HTML);
  assert.ok(d.level >= 1 && d.level <= 5, `level out of range: ${d.level}`);
});
