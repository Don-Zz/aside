// Rough, hand-maintained $/1M-token pricing for the "estimated cost" figure in
// the Usage tab. This is NOT billing-accurate — providers change prices, and
// our own token count is itself an estimate (see usage.js). Treat every number
// here as "in the right ballpark", not a receipt. Missing model -> $0 shown,
// never a guess dressed up as a real price.
const PRICING_PER_1M = {
  openai: {
    'gpt-4o': { in: 2.5, out: 10 },
    'gpt-4o-mini': { in: 0.15, out: 0.6 }
  },
  anthropic: {
    'claude-3-5-sonnet-latest': { in: 3, out: 15 },
    'claude-3-5-haiku-latest': { in: 0.8, out: 4 }
  },
  gemini: {
    'gemini-2.5-flash': { in: 0.3, out: 2.5 }
  },
  groq: {
    'llama-3.1-8b-instant': { in: 0.05, out: 0.08 },
    'llama-3.3-70b-versatile': { in: 0.59, out: 0.79 }
  }
};

// Local/self-hosted providers (Ollama, Custom endpoints) have no metered price
// from cue's point of view — cost stays $0 even though usage is still counted.
function estimateCostUsd(provider, model, inputTokens, outputTokens) {
  const table = PRICING_PER_1M[provider];
  const rate = table && (table[model] || Object.values(table)[0]);
  if (!rate) return 0;
  return (inputTokens / 1e6) * rate.in + (outputTokens / 1e6) * rate.out;
}

module.exports = { PRICING_PER_1M, estimateCostUsd };
