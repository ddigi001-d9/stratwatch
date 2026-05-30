// Assemble the four sources into one shared CONTEXT string with clear section headers.
// Each block is bounded so input tokens stay predictable.
function buildContext({ drudge = [], pizzint = {}, gdelt = [], kalshi = [] }) {
  const blocks = [];

  blocks.push(
    "=== DRUDGE HEADLINES ===\n" +
      (drudge.length ? drudge.map((h) => `- ${h}`).join("\n") : "(none)")
  );

  const d = pizzint.doughcon || {};
  const reports = (pizzint.reports || []).slice(0, 40);
  blocks.push(
    `=== PIZZINT OSINT FEED (DOUGHCON ${d.level ?? "?"}${d.label ? " " + d.label : ""}) ===\n` +
      (reports.length ? reports.map((r) => `- [@${r.account}] ${r.text}`).join("\n") : "(none)")
  );

  blocks.push(
    "=== GDELT GLOBAL WIRE (by theater) ===\n" +
      (gdelt.length
        ? gdelt
            .map((g) => `# ${g.theater}\n` + (g.articles || []).map((a) => `- ${a.title} (${a.domain})`).join("\n"))
            .join("\n")
        : "(none)")
  );

  blocks.push(
    "=== PREDICTION-MARKET ACTION (Kalshi) ===\n" +
      (kalshi.length
        ? kalshi
            .map((m) => {
              const delta = m.priceChange24h == null ? "—" : `${m.priceChange24h >= 0 ? "+" : ""}${m.priceChange24h}¢`;
              return `- [${m.ticker}] ${m.title} | price ${m.marketProb}% | 24h Δ${delta} | vol ${m.volume24h} | OI ${m.openInterest} | ${m.category}`;
            })
            .join("\n")
        : "(none)")
  );

  return blocks.join("\n\n");
}

module.exports = { buildContext };
