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

test("parseDoughcon extracts numeric level", () => {
  const d = parseDoughcon(HTML);
  assert.ok(d.level >= 1 && d.level <= 5, `level out of range: ${d.level}`);
});
