/**
 * Per-model token prices for eval/trace cost estimates (USD per 1M tokens).
 *
 * These are CONFIGURABLE ESTIMATES for comparing model configurations — verify
 * against current provider pricing (rates change). Output tokens are typically
 * several × input. Unknown models cost 0 (so an unpriced model just shows $0
 * rather than crashing the scorecard). Override via env PRICE_JSON if needed.
 */
const DEFAULT_PRICES = {
  // Anthropic (illustrative $/1M)
  'claude-haiku-4-5-20251001': { in: 0.8, out: 4 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-8': { in: 15, out: 75 },
  // OpenAI (illustrative $/1M) — for when the openai provider lands
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
};

function loadPrices() {
  if (process.env.PRICE_JSON) {
    try {
      return { ...DEFAULT_PRICES, ...JSON.parse(process.env.PRICE_JSON) };
    } catch {
      /* ignore malformed override */
    }
  }
  return DEFAULT_PRICES;
}

/** Price entry for a model, or {in:0,out:0} if unknown. */
function priceFor(model, prices = loadPrices()) {
  return prices[model] || { in: 0, out: 0 };
}

/**
 * Estimate cost in USD.
 * @param {{model: string, inputTokens?: number, outputTokens?: number}} usage
 * @returns {number} dollars
 */
function estimateCost({ model, inputTokens = 0, outputTokens = 0 }, prices = loadPrices()) {
  const p = priceFor(model, prices);
  return (inputTokens * p.in + outputTokens * p.out) / 1e6;
}

module.exports = { estimateCost, priceFor, DEFAULT_PRICES };
