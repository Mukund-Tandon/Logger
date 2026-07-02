const {
  SPIKE_SERVICE,
  deploymentRows,
  spikeLogRows,
  baselineLogRows,
} = require('./fixture');

describe('RCA fixture — deployment', () => {
  it('produces one deploy for the spike service, timed just before the spike', () => {
    const deploys = deploymentRows();
    expect(deploys).toHaveLength(1);
    expect(deploys[0].Service).toBe(SPIKE_SERVICE);
    expect(deploys[0].Version).toBeTruthy();
    // deploy is before 14:00 (the spike start)
    expect(deploys[0].DeployedAt < '2024-06-15 14:00:00').toBe(true);
  });
});

describe('RCA fixture — spike logs', () => {
  const rows = spikeLogRows();

  it('is a burst of ERROR logs for the spike service', () => {
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.every((r) => r.Level === 'ERROR')).toBe(true);
    expect(rows.every((r) => r.ResourceID === SPIKE_SERVICE)).toBe(true);
  });

  it('is confined to the 14:00–14:05 window', () => {
    for (const r of rows) {
      expect(r.Timestamp >= '2024-06-15 14:00:00').toBe(true);
      expect(r.Timestamp <= '2024-06-15 14:05:00.000000').toBe(true);
    }
  });

  it('shares a common message shape (so find_patterns collapses them)', () => {
    const { normalizeTemplate } = require('../tools/findPatterns');
    const templates = new Set(rows.map((r) => normalizeTemplate(r.Message)));
    expect(templates.size).toBe(1);
  });
});

describe('RCA fixture — baseline logs', () => {
  it('is a small number of pre-spike errors (so 14:00 reads as a spike)', () => {
    const base = baselineLogRows();
    expect(base.length).toBeGreaterThan(0);
    expect(base.length).toBeLessThan(spikeLogRows().length);
    expect(base.every((r) => r.Timestamp < '2024-06-15 14:00:00')).toBe(true);
  });
});
