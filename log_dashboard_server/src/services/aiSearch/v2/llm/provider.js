/**
 * Provider factory + registry (Phase 0.2).
 *
 * The swappable boundary: app code (agent/tools/eval) asks for a provider by
 * ROLE, never by vendor. `getProvider(role)` reads `config/models.js` to find
 * that role's provider name, then returns the adapter registered under that
 * name. Adapters live in `./providers/*` and are the ONLY place a vendor SDK
 * may be imported (see CLAUDE.md rule 5).
 *
 * Provider contract: `{ name: string, async complete(req, model) => LLMResponse }`.
 * See `./types.js` for the neutral LLMRequest/LLMResponse shapes.
 */
const models = require('../../../../../config/models');
const { anthropicProvider } = require('./providers/anthropic');
const { claudeCliProvider } = require('./providers/claudeCli');
const { openaiProvider } = require('./providers/openai');

/** @type {Map<string, { name: string, complete: Function }>} */
const registry = new Map();

/**
 * Register a provider adapter under its `name`. Adapters call this (or are
 * registered here) so `getProvider` can resolve them by the name configured
 * for a role in `config/models.js`.
 *
 * @param {{ name: string, complete: Function }} provider
 */
function registerProvider(provider) {
  if (!provider || !provider.name || typeof provider.complete !== 'function') {
    throw new Error('registerProvider requires { name, complete }');
  }
  registry.set(provider.name, provider);
}

// Register the known adapters. These are stubs until their phases land
// (anthropic 0.3, claude-cli 0.4, openai 4.1) — registering them keeps the
// factory resolvable without implementing any vendor translation here.
registerProvider(anthropicProvider);
registerProvider(claudeCliProvider);
registerProvider(openaiProvider);

/**
 * Resolve the provider adapter for a role.
 *
 * @param {"router"|"agent"|"escalation"|"judge"} role
 * @returns {{ name: string, complete: Function }}
 */
function getProvider(role) {
  const roleConfig = models[role];
  if (!roleConfig) {
    throw new Error(
      `getProvider: unknown role "${role}". Known roles: ${Object.keys(models).join(', ')}`
    );
  }

  const provider = registry.get(roleConfig.provider);
  if (!provider) {
    throw new Error(
      `getProvider: provider "${roleConfig.provider}" (role "${role}") is not registered. ` +
        `Registered providers: ${[...registry.keys()].join(', ') || '(none)'}`
    );
  }

  return provider;
}

module.exports = { getProvider, registerProvider, registry };
