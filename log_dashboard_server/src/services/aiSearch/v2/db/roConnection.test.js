const { readOnlyConfig } = require('./roConnection');

describe('readOnlyConfig', () => {
  it('defaults to the restricted log_agent user on local ClickHouse', () => {
    const cfg = readOnlyConfig({});
    expect(cfg.username).toBe('log_agent');
    expect(cfg.password).toBe('');
    expect(cfg.database).toBe('testdb');
    expect(cfg.url).toMatch(/8123/);
  });

  it('honors env overrides for prod credentials', () => {
    const cfg = readOnlyConfig({
      CH_RO_URL: 'https://ch.prod:8443',
      CH_RO_USER: 'reader',
      CH_RO_PASSWORD: 'secret',
      CH_RO_DATABASE: 'logs_db',
    });
    expect(cfg).toEqual({
      url: 'https://ch.prod:8443',
      username: 'reader',
      password: 'secret',
      database: 'logs_db',
    });
  });
});
