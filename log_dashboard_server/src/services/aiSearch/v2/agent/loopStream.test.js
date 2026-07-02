const { investigateStream } = require('./loop');

const acceptAll = async () => 'accept';

async function collect(gen) {
  const events = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

// Provider WITH native streaming: yields text deltas then a final response.
function streamingProvider(script) {
  return {
    name: 'streaming',
    async *stream() {
      const turn = script.shift();
      for (const delta of turn.deltas || []) yield { type: 'text', delta };
      yield { type: 'final', response: turn.response };
    },
  };
}

// Provider WITHOUT stream() — loop must fall back to complete().
function completeOnlyProvider(responses) {
  return {
    name: 'complete-only',
    calls: 0,
    async complete() {
      return responses[Math.min(this.calls++, responses.length - 1)];
    },
  };
}

const final = (text) => ({ text, toolCalls: [], stopReason: 'end', usage: {} });
const toolResp = (toolCalls) => ({ text: '', toolCalls, stopReason: 'tool_use', usage: {} });

describe('investigateStream — rejection', () => {
  it('emits a single rejected event and stops', async () => {
    const events = await collect(
      investigateStream('weather?', { classify: async () => 'reject', provider: completeOnlyProvider([]), tools: [] })
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('rejected');
    expect(events[0].message).toMatch(/logs/i);
  });
});

describe('investigateStream — native streaming provider', () => {
  it('emits text deltas then a final answer event', async () => {
    const provider = streamingProvider([{ deltas: ['Hel', 'lo'], response: final('Hello') }]);
    const events = await collect(investigateStream('hi', { classify: acceptAll, provider, tools: [] }));
    const deltas = events.filter((e) => e.type === 'text').map((e) => e.delta);
    expect(deltas).toEqual(['Hel', 'lo']);
    const answer = events.find((e) => e.type === 'answer');
    expect(answer.message).toBe('Hello');
    expect(Array.isArray(answer.logs)).toBe(true);
  });
});

describe('investigateStream — fallback for non-streaming provider', () => {
  it('emits the whole text as one delta then an answer', async () => {
    const provider = completeOnlyProvider([final('42 errors')]);
    const events = await collect(investigateStream('q', { classify: acceptAll, provider, tools: [] }));
    expect(events.find((e) => e.type === 'text').delta).toBe('42 errors');
    expect(events.find((e) => e.type === 'answer').message).toBe('42 errors');
  });
});

describe('investigateStream — tool events', () => {
  it('emits tool_call and tool_result events around a tool run, and surfaces logs', async () => {
    const rows = [{ c: 5 }];
    const tools = [
      { def: { name: 'run_sql', description: 'x', parameters: {} }, handler: async () => ({ data: rows, rowCount: 1 }) },
    ];
    const provider = completeOnlyProvider([
      toolResp([{ id: 't1', name: 'run_sql', input: { sql: 'SELECT count()' } }]),
      final('There were 5.'),
    ]);
    const events = await collect(investigateStream('how many?', { classify: acceptAll, provider, tools }));
    const call = events.find((e) => e.type === 'tool_call');
    const result = events.find((e) => e.type === 'tool_result');
    expect(call.name).toBe('run_sql');
    expect(result.name).toBe('run_sql');
    expect(result.isError).toBe(false);
    const answer = events.find((e) => e.type === 'answer');
    expect(answer.message).toBe('There were 5.');
    expect(answer.logs).toEqual(rows);
  });
});
