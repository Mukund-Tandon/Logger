/**
 * v2 AI Search entry point (Phase 0.6).
 *
 * `executeAISearchV2(message, history?)` runs the provider-agnostic agentic
 * tool-use loop (`agent/loop.js`) and shapes its result for the HTTP route.
 * The `options` param forwards injectable deps (provider/classify/tools) to the
 * loop — the route never passes it, so production uses the real registry and
 * getProvider("agent"); tests inject fakes to stay network-free.
 *
 * @param {string} message - natural-language question from the user.
 * @param {import('./llm/types').LLMMessage[]} [history] - prior turns for multi-turn drill-down.
 * @param {object} [options] - injectable loop deps (see agent/loop.js).
 * @returns {Promise<{type: string, message: string, transcript?: any[], steps?: number}>}
 */
const { investigate, investigateStream } = require('./agent/loop');
const { recordRun, summarizeStreamEvents } = require('./trace/runs');
const cache = require('./agent/cache');
const models = require('../../../../config/models');

async function executeAISearchV2(message, history = [], options = {}) {
  // Trace real invocations only — skip when a provider is injected (unit tests),
  // so the suite never touches ClickHouse. recordRun is fire-safe regardless.
  const shouldTrace = options.trace !== false && !options.provider;
  // Cache only real, single-turn questions (follow-ups depend on history).
  const useCache = options.cache !== false && !options.provider && (history.length || 0) === 0;
  const cacheKey = useCache ? cache.normalizeQuestion(message) : null;
  if (useCache) {
    const hit = cache.get(cacheKey);
    if (hit) return hit;
  }
  const startedAt = Date.now();
  const meta = { question: message, provider: models.agent.provider, model: models.agent.model };

  try {
    const result = await investigate(message, { history, ...options });

    if (shouldTrace) {
      await recordRun({
        ...meta,
        transcript: result.transcript,
        steps: result.steps,
        usage: result.usage,
        latencyMs: Date.now() - startedAt,
        answer: result.answer,
        rejected: !!result.rejected,
      });
    }

    if (result.rejected) {
      return { type: 'rejected', message: result.answer };
    }

    // Dashboard-compatible shape: logs + message (like v1), plus transcript for
    // multi-turn follow-ups (pass it back as `history`).
    const response = {
      type: 'success',
      message: result.answer,
      logs: result.logs || [],
      transcript: result.transcript,
      steps: result.steps,
      usage: result.usage,
    };
    if (useCache) cache.set(cacheKey, response);
    return response;
  } catch (err) {
    if (shouldTrace) {
      await recordRun({ ...meta, error: err.message, latencyMs: Date.now() - startedAt });
    }
    throw err;
  }
}

/**
 * Streaming entry point (Phase 1.4, traced in 3.3+). Async generator that yields
 * the SSE events from investigateStream AND records one `agent_runs` trace row
 * when the stream finishes (or errors), so SSE requests are traced just like the
 * JSON path. Tracing is skipped for injected-provider (test) runs; failures in
 * recordRun never affect the stream.
 *
 * @param {string} message
 * @param {import('./llm/types').LLMMessage[]} [history]
 * @param {object} [options] - injectable loop deps.
 */
async function* executeAISearchV2Stream(message, history = [], options = {}) {
  const shouldTrace = options.trace !== false && !options.provider;
  const startedAt = Date.now();
  const meta = { question: message, provider: models.agent.provider, model: models.agent.model };
  const collected = []; // only the events a trace needs (not every text delta)
  let error = null;

  try {
    for await (const event of investigateStream(message, { history, ...options })) {
      if (event.type !== 'text') collected.push(event);
      yield event;
    }
  } catch (err) {
    error = err.message;
    throw err;
  } finally {
    if (shouldTrace) {
      const s = summarizeStreamEvents(collected);
      // synthesize a minimal transcript so buildRunRow derives Tools uniformly
      const transcript = s.tools.map((name) => ({ role: 'assistant', content: [{ type: 'tool_call', name }] }));
      await recordRun({
        ...meta,
        transcript,
        steps: s.steps,
        usage: s.usage,
        latencyMs: Date.now() - startedAt,
        answer: s.answer,
        rejected: s.rejected,
        error,
      });
    }
  }
}

module.exports = { executeAISearchV2, executeAISearchV2Stream };
