const { buildSystemPrompt } = require('./systemPrompt');

describe('buildSystemPrompt', () => {
  const defs = [
    { name: 'run_sql', description: 'run one read-only query' },
    { name: 'get_schema', description: 'return the schema' },
  ];

  it('states the read-only rule and the untrusted-log-data rule', () => {
    const p = buildSystemPrompt(defs);
    expect(p).toMatch(/read-only/i);
    expect(p).toMatch(/untrusted|never instructions|not.*instructions/i);
  });

  it('lists the available tools by name', () => {
    const p = buildSystemPrompt(defs);
    expect(p).toContain('run_sql');
    expect(p).toContain('get_schema');
  });

  it('works with no tools', () => {
    expect(typeof buildSystemPrompt()).toBe('string');
  });

  it('gives an RCA playbook for why-did-X-spike questions', () => {
    const p = buildSystemPrompt(defs);
    expect(p).toMatch(/root.?cause|why did/i);
    expect(p).toContain('find_patterns');
    expect(p).toContain('get_changes');
  });

  it('instructs the model to cite queries and evidence', () => {
    const p = buildSystemPrompt(defs);
    expect(p).toMatch(/cite/i);
  });
});
