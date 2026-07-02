const { buildRunRow, summarizeStreamEvents } = require('./runs');

describe('summarizeStreamEvents', () => {
  it('collects tools, answer, steps and usage from a stream', () => {
    const s = summarizeStreamEvents([
      { type: 'text', delta: 'Let ' },
      { type: 'tool_call', name: 'get_schema' },
      { type: 'tool_result', name: 'get_schema', isError: false },
      { type: 'tool_call', name: 'run_sql' },
      { type: 'answer', message: 'There were 42.', steps: 3, usage: { inputTokens: 10, outputTokens: 5 } },
    ]);
    expect(s.tools).toEqual(['get_schema', 'run_sql']);
    expect(s.answer).toBe('There were 42.');
    expect(s.steps).toBe(3);
    expect(s.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(s.rejected).toBe(false);
  });

  it('captures a rejection', () => {
    const s = summarizeStreamEvents([{ type: 'rejected', message: 'not a logs question' }]);
    expect(s.rejected).toBe(true);
    expect(s.answer).toMatch(/logs/);
  });
});

const transcript = [
  { role: 'user', content: [{ type: 'text', text: 'q' }] },
  { role: 'assistant', content: [{ type: 'tool_call', id: 'a', name: 'get_schema', input: {} }] },
  { role: 'assistant', content: [{ type: 'tool_call', id: 'b', name: 'run_sql', input: {} }] },
];
const at = new Date('2024-06-15T14:00:00.000Z');

describe('buildRunRow', () => {
  it('maps an investigation into a flat agent_runs row', () => {
    const row = buildRunRow(
      {
        question: 'how many errors?',
        provider: 'claude-cli',
        model: 'claude-sonnet-4-6',
        transcript,
        steps: 3,
        usage: { inputTokens: 100, outputTokens: 50 },
        latencyMs: 1234,
        answer: 'There were 42.',
        rejected: false,
      },
      at
    );
    expect(row.Question).toBe('how many errors?');
    expect(row.Provider).toBe('claude-cli');
    expect(row.Model).toBe('claude-sonnet-4-6');
    expect(row.Steps).toBe(3);
    expect(row.Tools).toEqual(['get_schema', 'run_sql']);
    expect(row.InputTokens).toBe(100);
    expect(row.OutputTokens).toBe(50);
    expect(row.LatencyMs).toBe(1234);
    expect(row.Answer).toBe('There were 42.');
    expect(row.Error).toBe('');
    expect(row.Rejected).toBe(0);
    expect(row.RunAt).toBe('2024-06-15 14:00:00.000'); // ClickHouse DateTime64 format
  });

  it('records errors and flags rejections', () => {
    const errRow = buildRunRow({ question: 'q', error: 'boom', transcript: [], steps: 0 }, at);
    expect(errRow.Error).toBe('boom');
    expect(errRow.Answer).toBe('');
    const rejRow = buildRunRow({ question: 'q', rejected: true, transcript: [], steps: 0 }, at);
    expect(rejRow.Rejected).toBe(1);
  });

  it('truncates very long answers/errors', () => {
    const row = buildRunRow({ question: 'q', answer: 'x'.repeat(5000), transcript: [], steps: 1 }, at);
    expect(row.Answer.length).toBeLessThanOrEqual(2100);
  });

  it('defaults missing numeric/token fields to 0', () => {
    const row = buildRunRow({ question: 'q', transcript: [], steps: 1 }, at);
    expect(row.InputTokens).toBe(0);
    expect(row.OutputTokens).toBe(0);
    expect(row.LatencyMs).toBe(0);
    expect(row.Tools).toEqual([]);
  });
});
