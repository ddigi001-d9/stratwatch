const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { THEATER_QUERIES, normalizeArticles } = require("../sources/gdelt");

test("THEATER_QUERIES covers the five theaters", () => {
  const names = THEATER_QUERIES.map((q) => q.theater);
  for (const t of ["Middle East", "Indo-Pacific", "Europe", "Energy", "Americas"]) {
    assert.ok(names.includes(t), `missing theater ${t}`);
  }
});

test("normalizeArticles maps GDELT artlist json to title+domain, capped", () => {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/gdelt-europe.json"), "utf8"));
  const arts = normalizeArticles(json, 2);
  assert.strictEqual(arts.length, 2);
  assert.ok(arts[0].title.length > 0);
  assert.ok(arts[0].domain.length > 0);
});

test("normalizeArticles tolerates empty/missing articles", () => {
  assert.deepStrictEqual(normalizeArticles({}, 5), []);
  assert.deepStrictEqual(normalizeArticles(null, 5), []);
});
