/**
 * OpenAI provider adapter (Phase 4.1 — STUB).
 *
 * Proves the abstraction: implement per the translation cheat-sheet in
 * CLAUDE.md, register it, and run the eval set with `LLM_PROVIDER=openai`.
 * The only file (besides other adapters) allowed to import the OpenAI SDK.
 *
 * @type {{ name: string, complete: (req: import('../types').LLMRequest, model: string) => Promise<import('../types').LLMResponse> }}
 */
const openaiProvider = {
  name: 'openai',
  async complete(_req, _model) {
    throw new Error('openai provider not implemented yet (Phase 4.1)');
  },
};

module.exports = { openaiProvider };
