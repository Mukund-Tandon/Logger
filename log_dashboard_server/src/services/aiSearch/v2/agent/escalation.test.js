const { investigate } = require('./loop');

const acceptAll = async () => 'accept';
const toolResp = (name) => ({ text: '', toolCalls: [{ id: 't', name, input: { sql: 'x' } }], stopReason: 'tool_use', usage: {} });
const finalResp = (text) => ({ text, toolCalls: [], stopReason: 'end', usage: {} });

describe('investigate — escalation routing', () => {
  it('switches to the escalation provider after consecutive failing steps', async () => {
    // base model keeps issuing a query that always errors
    const base = { name: 'base', calls: 0, async complete() { this.calls++; return toolResp('run_sql'); } };
    // escalation model resolves the investigation
    const escalation = { name: 'escalation', calls: 0, async complete() { this.calls++; return finalResp('Fixed via escalation.'); } };
    const tools = [
      { def: { name: 'run_sql', description: 'x', parameters: {} }, handler: async () => ({ error: 'Unknown column' }) },
    ];

    const res = await investigate('q', {
      classify: acceptAll,
      provider: base,
      escalationProvider: escalation,
      tools,
      escalateAfter: 2,
      maxSteps: 6,
    });

    // base ran until the error streak hit the threshold, then escalation took over
    expect(base.calls).toBe(2);
    expect(escalation.calls).toBeGreaterThanOrEqual(1);
    expect(res.answer).toBe('Fixed via escalation.');
    expect(res.escalated).toBe(true);
  });

  it('does not escalate when steps succeed', async () => {
    const base = {
      name: 'base',
      calls: 0,
      async complete() {
        this.calls++;
        return this.calls === 1 ? toolResp('run_sql') : finalResp('done');
      },
    };
    const escalation = { name: 'escalation', calls: 0, async complete() { this.calls++; return finalResp('should not run'); } };
    const tools = [{ def: { name: 'run_sql', description: 'x', parameters: {} }, handler: async () => ({ data: [{ c: 1 }] }) }];

    const res = await investigate('q', { classify: acceptAll, provider: base, escalationProvider: escalation, tools, escalateAfter: 2 });
    expect(escalation.calls).toBe(0);
    expect(res.escalated).toBeFalsy();
    expect(res.answer).toBe('done');
  });
});
