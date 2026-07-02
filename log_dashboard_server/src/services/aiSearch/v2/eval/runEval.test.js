const path = require('path');
const { loadGolden, runGolden, formatReport } = require('./runEval');

describe('loadGolden', () => {
  it('parses the shipped golden.jsonl, skipping the _comment line', () => {
    const cases = loadGolden(path.resolve(__dirname, 'golden.jsonl'));
    expect(cases.length).toBeGreaterThanOrEqual(5);
    expect(cases.every((c) => c.id && c.question)).toBe(true);
    expect(cases.some((c) => c.id === 'rca-checkout-spike')).toBe(true);
  });
});

describe('runGolden', () => {
  const cases = [
    { id: 'ok', question: 'how many errors?', must_call: ['run_sql'], answer_matches: ['42'] },
    { id: 'rej', question: 'weather?', expect_reject: true },
    { id: 'bad', question: 'x', must_call: ['get_changes'] },
  ];

  // fake runner: no LLM, deterministic results keyed off the question
  const fakeRun = async (q) => {
    if (q === 'weather?') return { type: 'rejected', message: 'no' };
    return {
      type: 'success',
      message: 'There were 42 errors.',
      transcript: [{ role: 'assistant', content: [{ type: 'tool_call', id: 'a', name: 'run_sql', input: {} }] }],
    };
  };

  it('runs every case and computes a pass rate', async () => {
    const summary = await runGolden(cases, fakeRun);
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(2); // ok + rej pass; bad fails (no get_changes)
    expect(summary.results.find((r) => r.id === 'bad').pass).toBe(false);
    expect(summary.passRate).toBeCloseTo(2 / 3, 5);
  });

  it('formatReport renders a readable summary with the pass rate', async () => {
    const summary = await runGolden(cases, fakeRun);
    const report = formatReport(summary);
    expect(report).toMatch(/2\/3/);
    expect(report).toMatch(/bad/); // the failing case id shows up
  });

  it('aggregates a cost/latency/steps scorecard', async () => {
    const scored = [
      { id: 'a', question: 'q1', must_call: ['run_sql'] },
      { id: 'b', question: 'q2', must_call: ['run_sql'] },
    ];
    const run = async () => ({
      type: 'success',
      message: 'x',
      transcript: [{ role: 'assistant', content: [{ type: 'tool_call', id: 'a', name: 'run_sql', input: {} }] }],
      usage: { inputTokens: 1000, outputTokens: 200 },
      steps: 2,
    });
    const summary = await runGolden(scored, run, { model: 'claude-sonnet-4-6' });
    expect(summary.scorecard.model).toBe('claude-sonnet-4-6');
    expect(summary.scorecard.totalInputTokens).toBe(2000);
    expect(summary.scorecard.totalOutputTokens).toBe(400);
    // (2000*3 + 400*15) / 1e6 = 0.012
    expect(summary.scorecard.totalCostUsd).toBeCloseTo(0.012, 6);
    expect(summary.scorecard.avgSteps).toBe(2);
    expect(typeof summary.scorecard.avgLatencyMs).toBe('number');
  });

  it('formatReport includes the cost/latency scorecard', async () => {
    const scored = [{ id: 'a', question: 'q1', must_call: ['run_sql'] }];
    const run = async () => ({ type: 'success', message: 'x', transcript: [{ role: 'assistant', content: [{ type: 'tool_call', id: 'a', name: 'run_sql', input: {} }] }], usage: { inputTokens: 1000, outputTokens: 200 }, steps: 2 });
    const report = formatReport(await runGolden(scored, run, { model: 'claude-sonnet-4-6' }));
    expect(report).toMatch(/cost/i);
    expect(report).toMatch(/\$/);
    expect(report).toMatch(/tokens/i);
  });

  it('runs the judge for cases with a rubric and can fail them', async () => {
    const judged = [
      { id: 'rca', question: 'why spike?', must_call: ['run_sql'], judge: 'must name the deploy' },
    ];
    const run = async () => ({
      type: 'success',
      message: 'errors went up',
      transcript: [{ role: 'assistant', content: [{ type: 'tool_call', id: 'a', name: 'run_sql', input: {} }] }],
    });
    // structural checks pass (run_sql called), but the judge rejects the answer
    const judgeFn = async () => ({ pass: false, reason: 'no deploy named' });
    const summary = await runGolden(judged, run, { judgeFn });
    expect(summary.results[0].pass).toBe(false);
    expect(summary.results[0].failures.join(' ')).toMatch(/judge.*deploy/i);
  });
});
