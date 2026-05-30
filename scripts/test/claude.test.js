const { test } = require("node:test");
const assert = require("node:assert");
const { parseJSON, stripCites, extractText, SONNET, HAIKU } = require("../lib/claude");

test("model constants are current ids", () => {
  assert.strictEqual(SONNET, "claude-sonnet-4-6");
  assert.strictEqual(HAIKU, "claude-haiku-4-5-20251001");
});

test("parseJSON strips fences, cite tags, bracket refs", () => {
  const text = '```json\n{"a": <cite x>1</cite>, "b": "ok [1,2]"}\n```';
  assert.deepStrictEqual(parseJSON(text), { a: 1, b: "ok " });
});

test("stripCites cleans nested objects", () => {
  const obj = { h: "war <cite a>now</cite> [3]" };
  assert.deepStrictEqual(stripCites(obj), { h: "war now " });
});

test("extractText joins text blocks", () => {
  const data = { content: [{ type: "text", text: "a" }, { type: "tool_use" }, { type: "text", text: "b" }] };
  assert.strictEqual(extractText(data), "a\nb");
});
