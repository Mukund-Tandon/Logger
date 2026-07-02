const { normalizeTemplate, buildTemplateExpr, findPatterns } = require('./findPatterns');

describe('normalizeTemplate — collapses variable tokens to placeholders', () => {
  it('replaces plain numbers with <NUM>', () => {
    expect(normalizeTemplate('User 12345 logged in after 3 tries')).toBe(
      'User <NUM> logged in after <NUM> tries'
    );
  });

  it('replaces UUIDs with <UUID>', () => {
    expect(normalizeTemplate('Request 550e8400-e29b-41d4-a716-446655440000 failed')).toBe(
      'Request <UUID> failed'
    );
  });

  it('replaces IPv4 addresses with <IP> (not <NUM> per octet)', () => {
    expect(normalizeTemplate('Connection from 192.168.1.100 refused')).toBe(
      'Connection from <IP> refused'
    );
  });

  it('replaces hex literals with <HEX>', () => {
    expect(normalizeTemplate('pointer 0xDEADBEEF released')).toBe('pointer <HEX> released');
  });

  it('handles a message with several token types', () => {
    expect(
      normalizeTemplate('user 42 from 10.0.0.1 id 550e8400-e29b-41d4-a716-446655440000')
    ).toBe('user <NUM> from <IP> id <UUID>');
  });

  it('collapses two messages that differ only in ids to the same template', () => {
    const a = normalizeTemplate('order 111 for user 222 shipped');
    const b = normalizeTemplate('order 999 for user 333 shipped');
    expect(a).toBe(b);
  });
});

describe('buildTemplateExpr — ClickHouse-native templating SQL', () => {
  it('nests replaceRegexpAll over the column for each token type', () => {
    const expr = buildTemplateExpr('Message');
    expect(expr).toMatch(/replaceRegexpAll/);
    expect(expr).toContain('Message');
    expect(expr).toContain('<UUID>');
    expect(expr).toContain('<IP>');
    expect(expr).toContain('<NUM>');
  });
});

describe('findPatterns — input handling (no DB)', () => {
  it('returns { error } on an invalid level filter type', async () => {
    // level must be a string; an object should be rejected before hitting the DB.
    const res = await findPatterns({ level: { bad: true } });
    expect(res.error).toBeTruthy();
  });
});
