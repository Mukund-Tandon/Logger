const {
  buildProtocol,
  serializeTranscript,
  parseEnvelope,
  extractActionJson,
  actionToResponse,
  sanitizedChildEnv,
  claudeCliProvider,
} = require('./claudeCli');

describe('sanitizedChildEnv (spawn like a fresh terminal)', () => {
  it('strips auth/routing vars that would shadow the machine `claude login`', () => {
    const env = sanitizedChildEnv({
      HOME: '/Users/x',
      PATH: '/usr/bin',
      ANTHROPIC_BASE_URL: 'https://proxy.example',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      ANTHROPIC_AUTH_TOKEN: 'tok',
    });
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    // keeps everything else (so the CLI still works normally)
    expect(env.HOME).toBe('/Users/x');
    expect(env.PATH).toBe('/usr/bin');
  });

  it('strips Claude Code session markers so the child auths like a fresh terminal', () => {
    const env = sanitizedChildEnv({
      HOME: '/Users/x',
      CLAUDECODE: '1',
      CLAUDE_CODE_SESSION_ID: 'sess',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
    });
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
    expect(env.HOME).toBe('/Users/x');
  });

  it('does not mutate the input env', () => {
    const input = { ANTHROPIC_BASE_URL: 'https://proxy.example' };
    sanitizedChildEnv(input);
    expect(input.ANTHROPIC_BASE_URL).toBe('https://proxy.example');
  });
});

describe('buildProtocol (neutral request → CLI prompt)', () => {
  const req = {
    system: 'You investigate logs.',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'how many errors?' }] }],
    tools: [
      { name: 'run_sql', description: 'run one read-only query', parameters: { type: 'object' } },
    ],
  };

  it('includes the system prompt, tool defs, and the JSON-only contract', () => {
    const p = buildProtocol(req);
    expect(p).toContain('You investigate logs.');
    expect(p).toContain('run_sql');
    expect(p).toContain('run one read-only query');
    // emulated tool-calling contract
    expect(p).toMatch(/"action"\s*:\s*"tool"/);
    expect(p).toMatch(/"action"\s*:\s*"final"/);
    expect(p).toMatch(/only.*json/i);
  });

  it('works with no tools and no system', () => {
    const p = buildProtocol({ messages: [] });
    expect(typeof p).toBe('string');
    expect(p).toMatch(/"action"\s*:\s*"final"/);
  });
});

describe('serializeTranscript (messages → stdin)', () => {
  it('renders each turn with its role and text', () => {
    const s = serializeTranscript([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ]);
    expect(s).toMatch(/user/i);
    expect(s).toContain('hi');
    expect(s).toMatch(/assistant/i);
    expect(s).toContain('hello');
  });

  it('renders tool_call and tool_result blocks', () => {
    const s = serializeTranscript([
      { role: 'assistant', content: [{ type: 'tool_call', id: 't1', name: 'run_sql', input: { sql: 'SELECT 1' } }] },
      { role: 'tool', content: [{ type: 'tool_result', toolCallId: 't1', content: '42', isError: false }] },
    ]);
    expect(s).toContain('run_sql');
    expect(s).toContain('SELECT 1');
    expect(s).toContain('42');
  });
});

describe('parseEnvelope (CLI --output-format json)', () => {
  it('returns the result string on success', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '{"action":"final","text":"pong"}',
      usage: { input_tokens: 3, output_tokens: 2 },
    });
    const env = parseEnvelope(stdout);
    expect(env.result).toBe('{"action":"final","text":"pong"}');
    expect(env.usage).toEqual({ input_tokens: 3, output_tokens: 2 });
  });

  it('throws when the envelope reports an error', () => {
    const stdout = JSON.stringify({
      type: 'result',
      is_error: true,
      api_error_status: 401,
      result: 'Failed to authenticate. API Error: 401 Invalid authentication credentials',
    });
    expect(() => parseEnvelope(stdout)).toThrow(/401|authenticate/i);
  });

  it('throws on non-JSON stdout', () => {
    expect(() => parseEnvelope('not json at all')).toThrow();
  });
});

describe('extractActionJson (parse tolerance)', () => {
  it('parses a bare JSON object', () => {
    expect(extractActionJson('{"action":"final","text":"hi"}')).toEqual({
      action: 'final',
      text: 'hi',
    });
  });

  it('strips ```json fences', () => {
    const s = '```json\n{"action":"final","text":"hi"}\n```';
    expect(extractActionJson(s)).toEqual({ action: 'final', text: 'hi' });
  });

  it('tolerates prose wrapping the JSON object', () => {
    const s = 'Sure! Here is my reply:\n{"action":"tool","name":"run_sql","input":{"sql":"SELECT 1"}}\nHope that helps.';
    expect(extractActionJson(s)).toEqual({
      action: 'tool',
      name: 'run_sql',
      input: { sql: 'SELECT 1' },
    });
  });

  it('handles braces inside string values', () => {
    const s = '{"action":"final","text":"a {nested} brace"}';
    expect(extractActionJson(s)).toEqual({ action: 'final', text: 'a {nested} brace' });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractActionJson('there is no object here')).toThrow();
  });
});

describe('actionToResponse (action → neutral LLMResponse)', () => {
  it('maps a final action to stopReason end + text', () => {
    const res = actionToResponse({ action: 'final', text: 'done' }, { input_tokens: 1, output_tokens: 2 });
    expect(res.stopReason).toBe('end');
    expect(res.text).toBe('done');
    expect(res.toolCalls).toEqual([]);
    expect(res.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
  });

  it('maps a tool action to stopReason tool_use + a tool call', () => {
    const res = actionToResponse({ action: 'tool', name: 'run_sql', input: { sql: 'SELECT 1' } }, {});
    expect(res.stopReason).toBe('tool_use');
    expect(res.text).toBe('');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].name).toBe('run_sql');
    expect(res.toolCalls[0].input).toEqual({ sql: 'SELECT 1' });
    expect(typeof res.toolCalls[0].id).toBe('string');
    expect(res.toolCalls[0].id.length).toBeGreaterThan(0);
  });

  it('throws on an unknown action', () => {
    expect(() => actionToResponse({ action: 'nope' }, {})).toThrow(/unknown action/i);
  });
});

describe('claudeCliProvider', () => {
  it('is registered under name "claude-cli" with a complete() method', () => {
    expect(claudeCliProvider.name).toBe('claude-cli');
    expect(typeof claudeCliProvider.complete).toBe('function');
  });
});
