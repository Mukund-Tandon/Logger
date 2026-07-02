const { registry, runSql, getSchema } = require('./index');

describe('get_schema tool', () => {
  it('returns the logs table schema as { data }', async () => {
    const res = await getSchema();
    expect(res.error).toBeUndefined();
    expect(res.data.tableName).toBe('logs');
    const names = res.data.columns.map((c) => c.name);
    expect(names).toContain('Message');
    expect(names).toContain('Level');
  });
});

describe('run_sql tool — guardrail path (no DB needed)', () => {
  it('returns { error } (does not throw) when the query is not read-only', async () => {
    const res = await runSql({ sql: 'DROP TABLE logs' });
    expect(res.data).toBeUndefined();
    expect(res.error).toMatch(/guardrail|disallowed|write/i);
  });

  it('returns { error } for a multi-statement query', async () => {
    const res = await runSql({ sql: 'SELECT 1; DROP TABLE logs' });
    expect(res.error).toMatch(/multi-statement/i);
  });

  it('returns { error } for a missing sql argument', async () => {
    const res = await runSql({});
    expect(res.error).toBeTruthy();
  });
});

describe('neutral tool registry', () => {
  it('exposes run_sql and get_schema as ToolDefs with handlers', () => {
    const byName = Object.fromEntries(registry.map((t) => [t.def.name, t]));
    for (const name of ['run_sql', 'get_schema']) {
      expect(byName[name]).toBeTruthy();
      expect(typeof byName[name].def.description).toBe('string');
      expect(byName[name].def.description.length).toBeGreaterThan(0);
      expect(byName[name].def.parameters).toBeTypeOf('object');
      expect(typeof byName[name].handler).toBe('function');
    }
  });

  it('run_sql declares an sql string parameter', () => {
    const runSqlDef = registry.find((t) => t.def.name === 'run_sql').def;
    expect(runSqlDef.parameters.properties.sql.type).toBe('string');
    expect(runSqlDef.parameters.required).toContain('sql');
  });
});
