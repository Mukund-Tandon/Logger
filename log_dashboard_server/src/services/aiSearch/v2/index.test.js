const { executeAISearchV2 } = require('./index');

// Inject a scripted provider + classify so these stay network-free.
function scriptedProvider(responses) {
  return {
    name: 'scripted',
    calls: [],
    async complete() {
      const res = responses[Math.min(this.calls.length, responses.length - 1)];
      this.calls.push(1);
      return res;
    },
  };
}
const final = (text) => ({ text, toolCalls: [], stopReason: 'end', usage: {} });

describe('executeAISearchV2', () => {
  it('returns a success response carrying the answer and transcript', async () => {
    const provider = scriptedProvider([final('There were 42 errors.')]);
    const res = await executeAISearchV2('how many errors today?', [], {
      classify: async () => 'accept',
      provider,
      tools: [],
    });
    expect(res.type).toBe('success');
    expect(res.message).toBe('There were 42 errors.');
    expect(Array.isArray(res.transcript)).toBe(true);
    // dashboard-compatible: logs array always present
    expect(Array.isArray(res.logs)).toBe(true);
  });

  it('returns a rejected response for non-logs questions', async () => {
    const provider = scriptedProvider([final('unused')]);
    const res = await executeAISearchV2('what is the weather?', [], {
      classify: async () => 'reject',
      provider,
      tools: [],
    });
    expect(res.type).toBe('rejected');
    expect(res.message).toMatch(/logs/i);
  });
});
