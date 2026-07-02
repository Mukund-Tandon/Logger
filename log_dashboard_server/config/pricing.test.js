const { estimateCost, priceFor } = require('./pricing');

describe('pricing', () => {
  it('prices input and output tokens separately', () => {
    // 1M in @ $3 + 1M out @ $15 = $18
    expect(estimateCost({ model: 'claude-sonnet-4-6', inputTokens: 1e6, outputTokens: 1e6 })).toBeCloseTo(18, 6);
  });

  it('scales linearly with token counts', () => {
    expect(estimateCost({ model: 'claude-haiku-4-5-20251001', inputTokens: 500000, outputTokens: 100000 })).toBeCloseTo(
      (500000 * 0.8 + 100000 * 4) / 1e6,
      6
    );
  });

  it('costs 0 for an unknown model instead of crashing', () => {
    expect(estimateCost({ model: 'mystery-model', inputTokens: 1e6, outputTokens: 1e6 })).toBe(0);
    expect(priceFor('mystery-model')).toEqual({ in: 0, out: 0 });
  });

  it('defaults missing token fields to 0', () => {
    expect(estimateCost({ model: 'claude-sonnet-4-6' })).toBe(0);
  });
});
