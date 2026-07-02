const { capRows, ROW_CAP } = require('./runSql');

describe('capRows — bounds rows injected into model context', () => {
  it('passes small result sets through untouched', () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const out = capRows(rows);
    expect(out.data).toEqual(rows);
    expect(out.rowCount).toBe(2);
    expect(out.truncated).toBeUndefined();
  });

  it('caps large result sets and reports the full count', () => {
    const rows = Array.from({ length: ROW_CAP + 50 }, (_, i) => ({ i }));
    const out = capRows(rows);
    expect(out.data).toHaveLength(ROW_CAP);
    expect(out.rowCount).toBe(ROW_CAP + 50);
    expect(out.truncated).toBe(true);
    expect(out.note).toMatch(/aggregat|GROUP BY|filter/i);
  });

  it('respects a custom cap', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ i }));
    const out = capRows(rows, 3);
    expect(out.data).toHaveLength(3);
    expect(out.truncated).toBe(true);
  });
});
