const {
  toAnthropicRequest,
  fromAnthropicResponse,
  anthropicProvider,
} = require('./anthropic');

describe('toAnthropicRequest (neutral → Anthropic)', () => {
  it('lifts system to a top-level param and passes model + max_tokens', () => {
    const req = toAnthropicRequest(
      { system: 'be terse', messages: [], maxTokens: 512, temperature: 0.2 },
      'claude-sonnet-4-6'
    );
    expect(req.system).toBe('be terse');
    expect(req.model).toBe('claude-sonnet-4-6');
    expect(req.max_tokens).toBe(512);
    expect(req.temperature).toBe(0.2);
  });

  it('defaults max_tokens when the neutral request omits it', () => {
    const req = toAnthropicRequest({ messages: [] }, 'claude-sonnet-4-6');
    expect(typeof req.max_tokens).toBe('number');
    expect(req.max_tokens).toBeGreaterThan(0);
  });

  it('maps a text block to an Anthropic text block', () => {
    const req = toAnthropicRequest(
      { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
      'm'
    );
    expect(req.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ]);
  });

  it('maps a neutral tool_call block to an Anthropic tool_use block', () => {
    const req = toAnthropicRequest(
      {
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool_call', id: 'tc_1', name: 'run_sql', input: { sql: 'SELECT 1' } },
            ],
          },
        ],
      },
      'm'
    );
    expect(req.messages[0].content[0]).toEqual({
      type: 'tool_use',
      id: 'tc_1',
      name: 'run_sql',
      input: { sql: 'SELECT 1' },
    });
  });

  it('maps a neutral tool_result block (role "tool") to an Anthropic tool_result in a user turn', () => {
    const req = toAnthropicRequest(
      {
        messages: [
          {
            role: 'tool',
            content: [
              { type: 'tool_result', toolCallId: 'tc_1', content: '42', isError: false },
            ],
          },
        ],
      },
      'm'
    );
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'tc_1',
      content: '42',
      is_error: false,
    });
  });

  it('translates ToolDefs to Anthropic tools with input_schema', () => {
    const params = { type: 'object', properties: { sql: { type: 'string' } } };
    const req = toAnthropicRequest(
      { messages: [], tools: [{ name: 'run_sql', description: 'run a query', parameters: params }] },
      'm'
    );
    expect(req.tools).toEqual([
      { name: 'run_sql', description: 'run a query', input_schema: params },
    ]);
  });
});

describe('fromAnthropicResponse (Anthropic → neutral)', () => {
  it('concatenates text blocks into .text and reports end stopReason', () => {
    const res = fromAnthropicResponse({
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 3 },
    });
    expect(res.text).toBe('Hello world');
    expect(res.toolCalls).toEqual([]);
    expect(res.stopReason).toBe('end');
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 3 });
  });

  it('maps tool_use blocks to neutral toolCalls and stopReason tool_use', () => {
    const res = fromAnthropicResponse({
      content: [
        { type: 'text', text: 'let me check' },
        { type: 'tool_use', id: 'tu_9', name: 'run_sql', input: { sql: 'SELECT 1' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 5, output_tokens: 7 },
    });
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toEqual([
      { id: 'tu_9', name: 'run_sql', input: { sql: 'SELECT 1' } },
    ]);
    expect(res.text).toBe('let me check');
  });

  it('maps max_tokens and unknown stop reasons', () => {
    expect(fromAnthropicResponse({ content: [], stop_reason: 'max_tokens', usage: {} }).stopReason).toBe('max_tokens');
    expect(fromAnthropicResponse({ content: [], stop_reason: 'pause_turn', usage: {} }).stopReason).toBe('other');
  });
});

describe('anthropicProvider', () => {
  it('is registered under name "anthropic" with a complete() method', () => {
    expect(anthropicProvider.name).toBe('anthropic');
    expect(typeof anthropicProvider.complete).toBe('function');
  });
});
