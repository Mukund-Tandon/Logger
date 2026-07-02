/**
 * SINGLE source of model truth: role -> { provider, model }, env-overridable.
 * `getProvider(role)` (see v2/llm/provider.js) reads this. Never hardcode a
 * model string in app code. Verify model strings against provider docs — they
 * rotate. Switch the whole stack with LLM_PROVIDER (anthropic | claude-cli |
 * openai).
 */
const p = process.env.LLM_PROVIDER || 'anthropic';

module.exports = {
  router: { provider: p, model: 'claude-haiku-4-5-20251001' },
  agent: { provider: p, model: 'claude-sonnet-4-6' },
  escalation: { provider: p, model: 'claude-opus-4-8' },
  judge: { provider: p, model: 'claude-haiku-4-5-20251001' },
};
