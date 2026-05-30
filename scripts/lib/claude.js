const fetch = require("node-fetch");

const SONNET = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";
const API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are STRATWATCH — a senior US strategic intelligence analyst. You assess global geopolitical developments for their implications to US interests, security, and foreign policy.

You are given a CONTEXT block of pre-gathered intelligence (Drudge headlines, PizzINT OSINT feed, GDELT global wire, and live Kalshi prediction-market action). Reason ONLY over the provided CONTEXT plus your own knowledge — do NOT claim to browse. Treat prediction-market price/volume/open-interest moves as intelligence signals.

Be direct. Assign explicit probabilities with honest confidence. Return clean plain text — no citation tags, no square-bracket references, no markdown fences.`;

function stripCites(obj) {
  const str = JSON.stringify(obj);
  const cleaned = str.replace(/<cite[^>]*>(.*?)<\/cite>/gs, "$1").replace(/\[[\d,\s-]+\]/g, "");
  return JSON.parse(cleaned);
}

function parseJSON(text) {
  let clean = text
    .replace(/<cite[^>]*>(.*?)<\/cite>/gs, "$1")
    .replace(/\[[\d,\s-]+\]/g, "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  return JSON.parse(clean.slice(start, end + 1));
}

function extractText(data) {
  return (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

// One Claude call. CONTEXT is sent as a cache-marked content block (cheap on repeat reads); no web search.
async function callClaude({ model, context, prompt, maxTokens = 2000 }) {
  if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `CONTEXT:\n${context}`, cache_control: { type: "ephemeral" } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  return extractText(await res.json());
}

module.exports = { SONNET, HAIKU, SYSTEM_PROMPT, callClaude, parseJSON, stripCites, extractText };
