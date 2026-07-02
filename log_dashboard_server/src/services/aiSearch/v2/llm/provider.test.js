const { getProvider, registry } = require('./provider');

describe('getProvider (Phase 0.2 registry/factory)', () => {
  it('returns the registered provider for a configured role', () => {
    // config/models.js defaults every role to LLM_PROVIDER || "anthropic",
    // and the anthropic adapter stub is registered under that name.
    const provider = getProvider('agent');
    expect(provider).toBeTruthy();
    expect(provider.name).toBe('anthropic');
    expect(typeof provider.complete).toBe('function');
  });

  it('resolves each known role to a registered provider', () => {
    for (const role of ['router', 'agent', 'escalation', 'judge']) {
      const provider = getProvider(role);
      expect(typeof provider.complete).toBe('function');
    }
  });

  it('throws for an unknown role', () => {
    expect(() => getProvider('not-a-real-role')).toThrow(/unknown role/i);
  });

  it('throws when the configured provider has no registered adapter', () => {
    // Default config points "agent" at the anthropic adapter; remove it so the
    // configured provider name has no registered adapter, then restore.
    const saved = registry.get('anthropic');
    registry.delete('anthropic');
    try {
      expect(() => getProvider('agent')).toThrow(/not registered/i);
    } finally {
      registry.set('anthropic', saved);
    }
  });
});
