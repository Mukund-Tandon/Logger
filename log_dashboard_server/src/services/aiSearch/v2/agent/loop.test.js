const { investigate, truncateForContext, MAX_STEPS } = require('./loop');

// A provider that returns a scripted list of LLMResponses, one per call.
function scriptedProvider(responses) {
  return {
    name: 'scripted',
    calls: [],
    async complete(req, model) {
      const res = responses[Math.min(this.calls.length, responses.length - 1)];
      // Snapshot messages at call time — the loop mutates the live array after.
      this.calls.push({ ...req, messages: [...req.messages] });
      return res;
    },
  };
}

const acceptAll = async () => 'accept';

const finalResponse = (text) => ({ text, toolCalls: [], stopReason: 'end', usage: {} });
const toolResponse = (toolCalls, text = '') => ({ text, toolCalls, stopReason: 'tool_use', usage: {} });

describe('investigate — routing', () => {
  it('returns a friendly rejection and never calls the provider when routed reject', async () => {
    const provider = scriptedProvider([finalResponse('should not be used')]);
    const res = await investigate('what is the weather?', {
      classify: async () => 'reject',
      provider,
      tools: [],
    });
    expect(res.rejected).toBe(true);
    expect(res.answer).toMatch(/logs/i);
    expect(provider.calls.length).toBe(0);
  });
});

describe('investigate — single-shot answer', () => {
  it('returns the model answer when it stops without a tool call', async () => {
    const provider = scriptedProvider([finalResponse('There were 42 errors today.')]);
    const res = await investigate('how many errors today?', {
      classify: acceptAll,
      provider,
      tools: [],
    });
    expect(res.answer).toBe('There were 42 errors today.');
    expect(res.steps).toBe(1);
    expect(provider.calls.length).toBe(1);
  });
});

describe('investigate — tool use', () => {
  it('runs the requested tool, feeds the result back, and returns the final answer', async () => {
    const calledWith = [];
    const tools = [
      {
        def: { name: 'run_sql', description: 'x', parameters: {} },
        handler: async (input) => {
          calledWith.push(input);
          return { data: [{ c: 5 }] };
        },
      },
    ];
    const provider = scriptedProvider([
      toolResponse([{ id: 't1', name: 'run_sql', input: { sql: 'SELECT count()' } }], 'let me check'),
      finalResponse('There were 5 errors.'),
    ]);

    const res = await investigate('how many errors?', { classify: acceptAll, provider, tools });

    expect(calledWith).toEqual([{ sql: 'SELECT count()' }]);
    expect(res.answer).toBe('There were 5 errors.');
    expect(provider.calls.length).toBe(2);
    // second provider call must include the tool_result in the transcript
    const toolMsg = res.transcript.find((m) => m.role === 'tool');
    expect(toolMsg).toBeTruthy();
    expect(toolMsg.content[0].type).toBe('tool_result');
    expect(toolMsg.content[0].toolCallId).toBe('t1');
    expect(toolMsg.content[0].content).toContain('5');
    expect(toolMsg.content[0].isError).toBe(false);
  });
});

describe('investigate — error self-heal', () => {
  it('feeds a tool {error} back as an isError tool_result so the model can retry', async () => {
    const tools = [
      {
        def: { name: 'run_sql', description: 'x', parameters: {} },
        handler: async () => ({ error: 'Unknown column Foo' }),
      },
    ];
    const provider = scriptedProvider([
      toolResponse([{ id: 't1', name: 'run_sql', input: { sql: 'SELECT Foo' } }]),
      finalResponse('Fixed and answered.'),
    ]);

    const res = await investigate('q', { classify: acceptAll, provider, tools });

    const toolMsg = res.transcript.find((m) => m.role === 'tool');
    expect(toolMsg.content[0].isError).toBe(true);
    expect(toolMsg.content[0].content).toMatch(/Unknown column Foo/);
    expect(res.answer).toBe('Fixed and answered.');
  });

  it('reports an unknown tool as an isError tool_result', async () => {
    const provider = scriptedProvider([
      toolResponse([{ id: 't1', name: 'nope', input: {} }]),
      finalResponse('ok'),
    ]);
    const res = await investigate('q', { classify: acceptAll, provider, tools: [] });
    const toolMsg = res.transcript.find((m) => m.role === 'tool');
    expect(toolMsg.content[0].isError).toBe(true);
    expect(toolMsg.content[0].content).toMatch(/unknown tool/i);
  });
});

describe('investigate — step limit', () => {
  it('stops at maxSteps when the model keeps calling tools', async () => {
    const tools = [
      { def: { name: 'run_sql', description: 'x', parameters: {} }, handler: async () => ({ data: [] }) },
    ];
    // always asks for a tool → never terminates on its own
    const provider = scriptedProvider([
      toolResponse([{ id: 't1', name: 'run_sql', input: { sql: 'SELECT 1' } }]),
    ]);
    const res = await investigate('q', { classify: acceptAll, provider, tools, maxSteps: 2 });
    expect(provider.calls.length).toBe(2);
    expect(res.hitStepLimit).toBe(true);
    expect(res.stopReason).toBe('max_steps');
  });
});

describe('investigate — dashboard-compatible logs surfacing', () => {
  it('surfaces the rows from the last run_sql as `logs`', async () => {
    const rows = [{ Message: 'a' }, { Message: 'b' }];
    const tools = [
      { def: { name: 'run_sql', description: 'x', parameters: {} }, handler: async () => ({ data: rows, rowCount: 2 }) },
    ];
    const provider = scriptedProvider([
      toolResponse([{ id: 't1', name: 'run_sql', input: { sql: 'SELECT Message FROM logs' } }]),
      finalResponse('Here are 2 logs.'),
    ]);
    const res = await investigate('show me logs', { classify: acceptAll, provider, tools });
    expect(res.logs).toEqual(rows);
  });

  it('defaults logs to an empty array when no query ran', async () => {
    const provider = scriptedProvider([finalResponse('no query needed')]);
    const res = await investigate('hi', { classify: acceptAll, provider, tools: [] });
    expect(res.logs).toEqual([]);
  });
});

describe('investigate — multi-turn history', () => {
  it('threads prior history before the new user message', async () => {
    const history = [
      { role: 'user', content: [{ type: 'text', text: 'errors in checkout' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'there were 3' }] },
    ];
    const provider = scriptedProvider([finalResponse('now just the 500s: 1')]);
    await investigate('now just the 500s', { classify: acceptAll, provider, tools: [], history });
    const firstReq = provider.calls[0];
    // history first, then the new user turn
    expect(firstReq.messages[0].content[0].text).toBe('errors in checkout');
    expect(firstReq.messages[firstReq.messages.length - 1].content[0].text).toBe('now just the 500s');
  });
});

describe('truncateForContext', () => {
  it('leaves short strings unchanged', () => {
    expect(truncateForContext('hello', 100)).toBe('hello');
  });
  it('truncates long strings and notes it', () => {
    const out = truncateForContext('x'.repeat(50), 10);
    expect(out.length).toBeLessThan(50);
    expect(out).toMatch(/truncated/i);
  });
  it('has a sane default limit', () => {
    expect(typeof MAX_STEPS).toBe('number');
  });
});
