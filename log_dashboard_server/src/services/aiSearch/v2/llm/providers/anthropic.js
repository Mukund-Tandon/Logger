/**
 * Anthropic provider adapter (Phase 0.3).
 *
 * One of the ONLY files allowed to import a vendor SDK (`@anthropic-ai/sdk`,
 * see CLAUDE.md rule 5). Its whole job: translate the neutral LLMRequest →
 * Anthropic request, call the SDK, and translate the Anthropic response →
 * neutral LLMResponse. Nothing else in the stack knows about Anthropic.
 *
 * See ../types.js for the neutral shapes and CLAUDE.md for the translation
 * cheat-sheet (tool_call → tool_use, tool_result blocks, etc.).
 */
const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MAX_TOKENS = 1024;

/**
 * Translate one neutral content block to its Anthropic equivalent.
 * @param {import('../types').ContentBlock} block
 */
function toAnthropicBlock(block) {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_call':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    case 'tool_result': {
      const out = {
        type: 'tool_result',
        tool_use_id: block.toolCallId,
        content: block.content,
      };
      if (block.isError !== undefined) out.is_error = block.isError;
      return out;
    }
    default:
      throw new Error(`toAnthropicRequest: unknown content block type "${block.type}"`);
  }
}

/**
 * Neutral LLMRequest → Anthropic messages.create params. Pure function.
 * @param {import('../types').LLMRequest} req
 * @param {string} model
 */
function toAnthropicRequest(req, model) {
  const params = {
    model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: (req.messages || []).map((m) => ({
      // Anthropic has only user/assistant turns; neutral "tool" messages carry
      // tool_result blocks, which Anthropic expects inside a user turn.
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.map(toAnthropicBlock),
    })),
  };

  if (req.system !== undefined) params.system = req.system;
  if (req.temperature !== undefined) params.temperature = req.temperature;
  if (req.tools && req.tools.length > 0) {
    params.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  return params;
}

const STOP_REASON_MAP = {
  end_turn: 'end',
  stop_sequence: 'end',
  tool_use: 'tool_use',
  max_tokens: 'max_tokens',
};

/**
 * Anthropic messages response → neutral LLMResponse. Pure function.
 * @param {any} res - the Anthropic Message object.
 * @returns {import('../types').LLMResponse}
 */
function fromAnthropicResponse(res) {
  const content = res.content || [];
  const text = content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const toolCalls = content
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
  const usage = res.usage || {};

  return {
    text,
    toolCalls,
    stopReason: STOP_REASON_MAP[res.stop_reason] || 'other',
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    },
  };
}

/**
 * Translate one Anthropic SDK stream event to a neutral stream event, or null
 * for events we don't surface. Pure. (Phase 1.4)
 * @param {any} event
 * @returns {{type: 'text', delta: string} | null}
 */
function translateStreamEvent(event) {
  if (
    event &&
    event.type === 'content_block_delta' &&
    event.delta &&
    event.delta.type === 'text_delta'
  ) {
    return { type: 'text', delta: event.delta.text };
  }
  return null;
}

let _client = null;
/** Lazily construct the SDK client so importing/registering needs no API key. */
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_KEY;
    if (!apiKey) {
      throw new Error(
        'anthropic provider: set ANTHROPIC_API_KEY (or CLAUDE_KEY) to call the API'
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/** @type {{ name: string, complete: (req: import('../types').LLMRequest, model: string) => Promise<import('../types').LLMResponse> }} */
const anthropicProvider = {
  name: 'anthropic',
  async complete(req, model) {
    const response = await getClient().messages.create(toAnthropicRequest(req, model));
    return fromAnthropicResponse(response);
  },
  /**
   * Stream neutral events: {type:'text', delta} while generating, then one
   * {type:'final', response} with the assembled neutral LLMResponse.
   */
  async *stream(req, model) {
    const s = getClient().messages.stream(toAnthropicRequest(req, model));
    for await (const event of s) {
      const ev = translateStreamEvent(event);
      if (ev) yield ev;
    }
    const finalMessage = await s.finalMessage();
    yield { type: 'final', response: fromAnthropicResponse(finalMessage) };
  },
};

module.exports = {
  anthropicProvider,
  toAnthropicRequest,
  fromAnthropicResponse,
  translateStreamEvent,
};
