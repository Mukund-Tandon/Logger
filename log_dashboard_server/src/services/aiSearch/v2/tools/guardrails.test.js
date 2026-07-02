const { assertReadOnly, isReadOnly } = require('./guardrails');

describe('assertReadOnly — allows read-only queries', () => {
  const allowed = [
    'SELECT * FROM logs LIMIT 1',
    'select count() from testdb.logs',
    '  SELECT Level, count() FROM logs GROUP BY Level  ',
    'SHOW TABLES FROM testdb',
    'DESCRIBE testdb.logs',
    'EXPLAIN SELECT 1',
    'WITH e AS (SELECT * FROM logs WHERE Level = \'error\') SELECT count() FROM e',
    'SELECT 1;', // a single trailing semicolon is fine
  ];
  for (const sql of allowed) {
    it(`allows: ${sql.trim().slice(0, 40)}`, () => {
      expect(() => assertReadOnly(sql)).not.toThrow();
      expect(isReadOnly(sql)).toBe(true);
    });
  }
});

describe('assertReadOnly — rejects writes / DDL', () => {
  const writes = [
    'INSERT INTO logs VALUES (now(), \'info\', \'x\', \'r\')',
    'UPDATE logs SET Level = \'info\'',
    'DELETE FROM logs WHERE 1=1',
    'DROP TABLE logs',
    'CREATE TABLE t (a Int)',
    'ALTER TABLE logs ADD COLUMN x String',
    'TRUNCATE TABLE logs',
    'RENAME TABLE logs TO logs2',
    'REPLACE INTO logs VALUES (1)',
  ];
  for (const sql of writes) {
    it(`rejects: ${sql.slice(0, 40)}`, () => {
      expect(() => assertReadOnly(sql)).toThrow();
      expect(isReadOnly(sql)).toBe(false);
    });
  }
});

describe('assertReadOnly — rejects non-read starters and multi-statement', () => {
  it('rejects a query that does not start with a read operation', () => {
    expect(() => assertReadOnly('GRANT SELECT ON logs TO user')).toThrow();
    expect(() => assertReadOnly('; SELECT 1')).toThrow();
  });

  it('rejects a stacked write hidden after a SELECT (multi-statement)', () => {
    expect(() => assertReadOnly('SELECT 1; DROP TABLE logs')).toThrow(/multi-statement/i);
  });

  it('rejects two selects stacked (multi-statement)', () => {
    expect(() => assertReadOnly('SELECT 1; SELECT 2')).toThrow(/multi-statement/i);
  });

  it('rejects empty / non-string input', () => {
    expect(() => assertReadOnly('')).toThrow();
    expect(() => assertReadOnly(null)).toThrow();
  });
});
