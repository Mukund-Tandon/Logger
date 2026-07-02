/**
 * Cheap request router (Phase 0.6).
 *
 * `classify(message)` decides whether a message is a logs/observability
 * question worth running the full agent loop, using the cheap `router` model.
 * Fails OPEN: on ambiguous output or a router outage it returns "accept", so a
 * real question is never wrongly rejected (a wrong accept just costs one step).
 *
 * @param {string} message
 * @param {{ provider?: {complete: Function}, model?: string }} [options]
 * @returns {Promise<"accept"|"reject">}
 */
const { getProvider } = require('../llm/provider');
const models = require('../../../../../config/models');

const ROUTER_SYSTEM = [
  'You are a router for a log-analysis assistant.',
  'Decide whether the user message is a question about application logs or observability data',
  '(e.g. error counts, log levels, spikes, time ranges, root-cause of an incident).',
  'Reply with exactly one word: "accept" if it is such a question, or "reject" if it is not.',
].join(' ');

async function classify(message, options = {}) {
  const provider = options.provider || getProvider('router');
  const model = options.model || models.router.model;

  try {
    const res = await provider.complete(
      {
        system: ROUTER_SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: message }] }],
        maxTokens: 5,
        temperature: 0,
      },
      model
    );
    const text = (res.text || '').toLowerCase();
    if (text.includes('reject')) return 'reject';
    return 'accept';
  } catch (err) {
    // Router outage must not block real questions — fail open.
    return 'accept';
  }
}

module.exports = { classify };
