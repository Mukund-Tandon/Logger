const { getChanges, buildChangesSql } = require('./getChanges');

describe('buildChangesSql', () => {
  it('queries deployments newest-first with a LIMIT', () => {
    const sql = buildChangesSql({ limit: 10 });
    expect(sql).toMatch(/FROM deployments/i);
    expect(sql).toMatch(/ORDER BY DeployedAt DESC/i);
    expect(sql).toMatch(/LIMIT 10/);
  });

  it('adds window bounds and a service filter when given', () => {
    const sql = buildChangesSql({ start: '2024-06-15 13:00:00', end: '2024-06-15 15:00:00', service: 'checkout' });
    expect(sql).toMatch(/DeployedAt >=/);
    expect(sql).toMatch(/DeployedAt <=/);
    expect(sql).toContain("Service = 'checkout'");
  });

  it('escapes single quotes in the service filter', () => {
    const sql = buildChangesSql({ service: "o'brien" });
    expect(sql).toContain("Service = 'o''brien'");
  });
});

describe('getChanges — input handling (no DB)', () => {
  it('rejects a non-string service', async () => {
    const res = await getChanges({ service: { bad: true } });
    expect(res.error).toMatch(/service/i);
  });
  it('rejects a non-string start', async () => {
    const res = await getChanges({ start: 123 });
    expect(res.error).toMatch(/start/i);
  });
});
