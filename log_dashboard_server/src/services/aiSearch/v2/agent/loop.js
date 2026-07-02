/**
 * Provider-agnostic tool-use loop (Phase 0.6).
 *
 * `investigate(message, options?)`:
 *   1. router.classify(message) → friendly rejection for non-logs questions.
 *   2. up to MAX_STEPS iterations of getProvider("agent").complete({system, tools, messages}).
 *   3. run each requested tool (guardrails live inside the tool), append the
 *      (truncated) result as a tool_result, and re-enter the loop.
 *   4. a tool {error} comes back as an isError tool_result so the model can
 *      self-heal (this replaces v1's separate fixSQLQueryErrors step).
 *
 * Everything is provider-agnostic: it only speaks the neutral shapes in
 * ../llm/types.js. Dependencies (provider, classify, tools, system) are
 * injectable so the loop is testable without a network or a live LLM.
 *
 * @param {string} message
 * @param {{
 *   history?: import('../llm/types').LLMMessage[],
 *   provider?: { complete: Function },
 *   model?: string,
 *   tools?: {def: import('../llm/types').ToolDef, handler: Function}[],
 *   classify?: (message: string) => Promise<"accept"|"reject">,
 *   system?: string,
 *   maxSteps?: number,
 * }} [options]
 * @returns {Promise<{answer: string, transcript: import('../llm/types').LLMMessage[], steps?: number, stopReason?: string, rejected?: boolean, hitStepLimit?: boolean}>}
 */
const { getProvider } = require('../llm/provider');
const models = require('../../../../../config/models');
const { registry } = require('../tools');
const { buildSystemPrompt } = require('./systemPrompt');
const { classify: defaultClassify } = require('./router');

const MAX_STEPS = 12;
const MAX_TOOL_RESULT_CHARS = 12000;
// Escalate to the stronger `escalation` model after this many consecutive
// steps where every tool call errored (the default model is stuck).
const ESCALATE_AFTER = 2;

const REJECTION_MESSAGE =
  'I can only help with questions about your logs — things like error counts, log-level breakdowns, ' +
  'spikes, time ranges, or why something happened. Try asking about your log data.';

/** Truncate a tool result before it re-enters the model context. */
function truncateForContext(str, limit = MAX_TOOL_RESULT_CHARS) {
  if (str.length <= limit) return str;
  return `${str.slice(0, limit)}\n...[truncated ${str.length - limit} chars]`;
}

// --- Observability: watch the agent work in the server logs -----------------
// Logs the steps, the model's text, and each tool call + a SUMMARY of its
// result (row count / error) — never the tool result DATA itself, which can be
// large. Set AI_AGENT_LOG=off to silence.
function log(...args) {
  if (process.env.AI_AGENT_LOG === 'off') return;
  console.log('[ai-agent]', ...args);
}

/** Collapse whitespace and cap length so a log line stays readable. */
function short(value, n = 200) {
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** One-line summary of a tool outcome (never includes the raw data). */
function summarizeOutcome(outcome) {
  if (!outcome) return 'no result';
  if (outcome.error !== undefined) return `ERROR: ${short(outcome.error, 160)}`;
  if (Array.isArray(outcome.data)) {
    return `${outcome.data.length} row(s)${outcome.truncated ? ` of ${outcome.rowCount} (truncated)` : ''}`;
  }
  return 'ok';
}

/** Token-usage suffix if the provider reported it. */
function usageTag(res) {
  const u = res && res.usage;
  if (!u || (!u.inputTokens && !u.outputTokens)) return '';
  return `  (${u.inputTokens || 0}→${u.outputTokens || 0} tok)`;
}

function userMessage(text) {
  return { role: 'user', content: [{ type: 'text', text }] };
}

/** Reconstruct the assistant turn (text + tool_call blocks) from a response. */
function assistantMessage(res) {
  const content = [];
  if (res.text) content.push({ type: 'text', text: res.text });
  for (const tc of res.toolCalls || []) {
    content.push({ type: 'tool_call', id: tc.id, name: tc.name, input: tc.input });
  }
  return { role: 'assistant', content };
}

async function runToolCall(toolCall, handlers) {
  const handler = handlers.get(toolCall.name);
  if (!handler) return { error: `unknown tool: ${toolCall.name}` };
  try {
    return await handler(toolCall.input || {});
  } catch (err) {
    return { error: err.message };
  }
}

function toolResultBlock(toolCall, outcome) {
  const isError = outcome && outcome.error !== undefined;
  // Serialize the whole outcome (data + any metadata like rowCount/truncated/
  // note) so the model sees the summary, not just the rows.
  const payload = isError ? { error: outcome.error } : outcome;
  return {
    type: 'tool_result',
    toolCallId: toolCall.id,
    content: truncateForContext(JSON.stringify(payload)),
    isError,
  };
}

async function investigate(message, options = {}) {
  const {
    history = [],
    provider = getProvider('agent'),
    model = models.agent.model,
    tools = registry,
    classify = defaultClassify,
    maxSteps = MAX_STEPS,
  } = options;

  log(`▶ investigate: "${short(message, 160)}"  [provider=${provider.name || '?'} model=${model}]`);
  const decision = await classify(message);
  log(`router: ${decision}`);
  if (decision === 'reject') {
    log('✗ rejected — not a logs question');
    return { rejected: true, answer: REJECTION_MESSAGE, transcript: [] };
  }

  const handlers = new Map(tools.map((t) => [t.def.name, t.handler]));
  const defs = tools.map((t) => t.def);
  const system = options.system !== undefined ? options.system : buildSystemPrompt(defs);

  const messages = [...history, userMessage(message)];
  let lastText = '';
  // Rows from the most recent run_sql, surfaced to the dashboard as `logs`.
  let logs = [];
  // Aggregate token usage across steps for tracing.
  const usage = { inputTokens: 0, outputTokens: 0 };
  // Escalation: after ESCALATE_AFTER consecutive all-errored steps, retry with
  // the stronger `escalation` model.
  const escalateAfter = options.escalateAfter || ESCALATE_AFTER;
  const escalationModel = options.escalationModel || models.escalation.model;
  let errorStreak = 0;
  let escalated = false;

  for (let step = 0; step < maxSteps; step++) {
    const useEscalation = errorStreak >= escalateAfter;
    const activeProvider = useEscalation
      ? options.escalationProvider || getProvider('escalation')
      : provider;
    const activeModel = useEscalation ? escalationModel : model;
    if (useEscalation && !escalated) {
      escalated = true;
      log(`↑ escalating to ${activeProvider.name || '?'}/${activeModel} after ${errorStreak} failing step(s)`);
    }

    log(`step ${step + 1}: thinking…${useEscalation ? ' (escalated)' : ''}`);
    const res = await activeProvider.complete({ system, messages, tools: defs }, activeModel);
    messages.push(assistantMessage(res));
    if (res.text) lastText = res.text;
    if (res.usage) {
      usage.inputTokens += res.usage.inputTokens || 0;
      usage.outputTokens += res.usage.outputTokens || 0;
    }
    if (res.text) log(`step ${step + 1} · assistant: "${short(res.text)}"${usageTag(res)}`);

    const wantsTools = res.stopReason === 'tool_use' && res.toolCalls && res.toolCalls.length > 0;
    if (!wantsTools) {
      log(`✓ done in ${step + 1} step(s): "${short(res.text || lastText)}"`);
      return {
        answer: res.text || lastText,
        logs,
        transcript: messages,
        steps: step + 1,
        stopReason: res.stopReason,
        usage,
        escalated,
      };
    }

    const resultBlocks = [];
    for (const toolCall of res.toolCalls) {
      log(`step ${step + 1} · tool → ${toolCall.name} ${short(JSON.stringify(toolCall.input || {}))}`);
      const outcome = await runToolCall(toolCall, handlers);
      log(`             ${toolCall.name} ⇒ ${summarizeOutcome(outcome)}`);
      if (toolCall.name === 'run_sql' && outcome && Array.isArray(outcome.data)) {
        logs = outcome.data;
      }
      resultBlocks.push(toolResultBlock(toolCall, outcome));
    }
    // Track consecutive fully-failed steps for the escalation trigger.
    const allErrored = resultBlocks.length > 0 && resultBlocks.every((b) => b.isError);
    errorStreak = allErrored ? errorStreak + 1 : 0;
    messages.push({ role: 'tool', content: resultBlocks });
  }

  log(`⚠ hit step limit (${maxSteps}) — returning partial findings`);
  return {
    answer:
      lastText ||
      `I gathered data across ${maxSteps} steps but couldn't reach a firm conclusion within the step limit. The results I retrieved are shown below — try narrowing the question (a specific service, level, or time window).`,
    logs,
    transcript: messages,
    steps: maxSteps,
    stopReason: 'max_steps',
    hitStepLimit: true,
    usage,
    escalated,
  };
}

/**
 * Streaming variant of {@link investigate} (Phase 1.4). Async generator that
 * yields events as the investigation unfolds — for SSE from `/ai_search/v2`:
 *   { type: 'rejected', message }
 *   { type: 'text', delta }                 // assistant text, streamed
 *   { type: 'tool_call', id, name, input }
 *   { type: 'tool_result', id, name, isError }
 *   { type: 'answer', message, logs, steps, hitStepLimit? }
 * Uses provider.stream() when available; otherwise falls back to complete()
 * and emits the whole text as one delta. Same deps/injection as investigate().
 *
 * @param {string} message
 * @param {object} [options]
 */
async function* investigateStream(message, options = {}) {
  const {
    history = [],
    provider = getProvider('agent'),
    model = models.agent.model,
    tools = registry,
    classify = defaultClassify,
    maxSteps = MAX_STEPS,
  } = options;

  log(`▶ investigate (stream): "${short(message, 160)}"  [provider=${provider.name || '?'} model=${model}]`);
  const decision = await classify(message);
  log(`router: ${decision}`);
  if (decision === 'reject') {
    log('✗ rejected — not a logs question');
    yield { type: 'rejected', message: REJECTION_MESSAGE };
    return;
  }

  const handlers = new Map(tools.map((t) => [t.def.name, t.handler]));
  const defs = tools.map((t) => t.def);
  const system = options.system !== undefined ? options.system : buildSystemPrompt(defs);

  const messages = [...history, userMessage(message)];
  let lastText = '';
  let logs = [];
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (let step = 0; step < maxSteps; step++) {
    log(`step ${step + 1}: thinking…`);
    const req = { system, messages, tools: defs };
    let response;

    if (typeof provider.stream === 'function') {
      for await (const ev of provider.stream(req, model)) {
        if (ev.type === 'text') yield { type: 'text', delta: ev.delta };
        else if (ev.type === 'final') response = ev.response;
      }
    } else {
      response = await provider.complete(req, model);
      if (response.text) yield { type: 'text', delta: response.text };
    }

    messages.push(assistantMessage(response));
    if (response.text) lastText = response.text;
    if (response.usage) {
      usage.inputTokens += response.usage.inputTokens || 0;
      usage.outputTokens += response.usage.outputTokens || 0;
    }
    if (response.text) log(`step ${step + 1} · assistant: "${short(response.text)}"${usageTag(response)}`);

    const wantsTools =
      response.stopReason === 'tool_use' && response.toolCalls && response.toolCalls.length > 0;
    if (!wantsTools) {
      log(`✓ done in ${step + 1} step(s): "${short(response.text || lastText)}"`);
      yield { type: 'answer', message: response.text || lastText, logs, steps: step + 1, usage };
      return;
    }

    const resultBlocks = [];
    for (const toolCall of response.toolCalls) {
      log(`step ${step + 1} · tool → ${toolCall.name} ${short(JSON.stringify(toolCall.input || {}))}`);
      yield { type: 'tool_call', id: toolCall.id, name: toolCall.name, input: toolCall.input };
      const outcome = await runToolCall(toolCall, handlers);
      log(`             ${toolCall.name} ⇒ ${summarizeOutcome(outcome)}`);
      if (toolCall.name === 'run_sql' && outcome && Array.isArray(outcome.data)) logs = outcome.data;
      const block = toolResultBlock(toolCall, outcome);
      yield { type: 'tool_result', id: toolCall.id, name: toolCall.name, isError: block.isError };
      resultBlocks.push(block);
    }
    messages.push({ role: 'tool', content: resultBlocks });
  }
  log(`⚠ hit step limit (${maxSteps}) — returning partial findings`);

  yield {
    type: 'answer',
    message: lastText || 'I reached the investigation step limit before a final answer.',
    logs,
    steps: maxSteps,
    hitStepLimit: true,
    usage,
  };
}

module.exports = { investigate, investigateStream, truncateForContext, MAX_STEPS };
