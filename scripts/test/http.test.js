const { test } = require("node:test");
const assert = require("node:assert");
const { BROWSER_UA, httpGet } = require("../lib/http");

test("exports a browser User-Agent string", () => {
  assert.match(BROWSER_UA, /Mozilla\/5\.0/);
});

test("httpGet is a function", () => {
  assert.strictEqual(typeof httpGet, "function");
});
