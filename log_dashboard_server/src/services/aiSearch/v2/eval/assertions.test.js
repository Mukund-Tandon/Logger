const { extractToolCalls, evaluateCase } = require('./assertions');

const transcript = [
  { role: 'user', content: [{ type: 'text', text: 'q' }] },
  { role: 'assistant', content: [{ type: 'tool_call', id: 'a', name: 'get_schema', input: {} }] },
  { role: 'tool', content: [{ type: 'tool_result', toolCallId: 'a', content: '{}' }] },
  { role: 'assistant', content: [{ type: 'tool_call', id: 'b', name: 'run_sql', input: { sql: 'SELECT 1' } }] },
  { role: 'assistant', content: [{ type: 'text', text: 'There were 42 errors after the deploy.' }] },
];
const success = { type: 'success', message: 'There were 42 errors after the deploy.', transcript };

describe('extractToolCalls', () => {
  it('lists tool names called across the transcript, in order', () => {
    expect(extractToolCalls(transcript)).toEqual(['get_schema', 'run_sql']);
  });
  it('returns [] for an empty transcript', () => {
    expect(extractToolCalls([])).toEqual([]);
  });
});

describe('evaluateCase', () => {
  it('passes when must_call tools were called and answer matches', () => {
    const r = evaluateCase(
      { id: 'c1', question: 'q', must_call: ['run_sql'], answer_matches: ['42', 'deploy'] },
      success
    );
    expect(r.pass).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('fails when a required tool was not called', () => {
    const r = evaluateCase({ id: 'c2', question: 'q', must_call: ['get_changes'] }, success);
    expect(r.pass).toBe(false);
    expect(r.failures.join(' ')).toMatch(/get_changes/);
  });

  it('fails when the answer is missing an expected substring', () => {
    const r = evaluateCase({ id: 'c3', question: 'q', answer_matches: ['cancelled'] }, success);
    expect(r.pass).toBe(false);
    expect(r.failures.join(' ')).toMatch(/cancelled/i);
  });

  it('answer_matches is case-insensitive', () => {
    const r = evaluateCase({ id: 'c4', question: 'q', answer_matches: ['DEPLOY'] }, success);
    expect(r.pass).toBe(true);
  });

  it('honors must_not_call', () => {
    const r = evaluateCase({ id: 'c5', question: 'q', must_not_call: ['run_sql'] }, success);
    expect(r.pass).toBe(false);
    expect(r.failures.join(' ')).toMatch(/run_sql/);
  });

  it('expect_reject passes only for a rejected result', () => {
    expect(evaluateCase({ id: 'c6', question: 'q', expect_reject: true }, { type: 'rejected', message: 'no' }).pass).toBe(true);
    expect(evaluateCase({ id: 'c7', question: 'q', expect_reject: true }, success).pass).toBe(false);
  });

  it('fails a non-reject case that did not succeed', () => {
    const r = evaluateCase({ id: 'c8', question: 'q', must_call: ['run_sql'] }, { type: 'error', message: 'boom', transcript: [] });
    expect(r.pass).toBe(false);
    expect(r.failures.join(' ')).toMatch(/success|error/i);
  });
});
