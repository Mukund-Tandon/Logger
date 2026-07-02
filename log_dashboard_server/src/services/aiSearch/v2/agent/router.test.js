const { classify } = require('./router');

function fakeProvider(text, { throws = false } = {}) {
  return {
    name: 'fake',
    calls: [],
    async complete(req, model) {
      this.calls.push({ req, model });
      if (throws) throw new Error('router provider down');
      return { text, toolCalls: [], stopReason: 'end', usage: {} };
    },
  };
}

describe('router.classify', () => {
  it('returns "reject" when the model says reject', async () => {
    const provider = fakeProvider('reject');
    expect(await classify('what is the weather today?', { provider })).toBe('reject');
  });

  it('returns "accept" when the model says accept', async () => {
    const provider = fakeProvider('accept');
    expect(await classify('how many errors in the last hour?', { provider })).toBe('accept');
  });

  it('fails open (accept) on ambiguous output', async () => {
    const provider = fakeProvider('hmm not sure');
    expect(await classify('something', { provider })).toBe('accept');
  });

  it('fails open (accept) when the router provider throws', async () => {
    const provider = fakeProvider('', { throws: true });
    expect(await classify('how many errors?', { provider })).toBe('accept');
  });
});
