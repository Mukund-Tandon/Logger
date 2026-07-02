/**
 * Claude Code CLI provider adapter (Phase 0.4).
 *
 * Free local dev/testing path: spawns the Claude Code CLI in headless mode
 * (`claude -p <protocol> --model <model> --output-format json`, transcript on
 * stdin) using the machine's `claude login` — no API key, no per-token billing
 * ("free" = covered by your Claude plan's usage limits).
 *
 * The CLI has NO native tool protocol, so this adapter EMULATES tool-calling in
 * the prompt: it serializes system + tool defs + a strict reply contract into
 * the protocol and instructs the model to answer with ONLY a JSON object —
 * either {action:"tool",name,input} or {action:"final",text} — then maps that
 * to a neutral LLMResponse. Emulated tool-calling is less reliable than the
 * API's native tool_use and the subprocess adds latency: dev/test on
 * claude-cli, run final evals on `anthropic`.
 *
 * Registered as provider `claude-cli`. Uses async spawn (never blocks the event
 * loop). Restricts Claude Code's own built-in tools so it acts as a pure
 * completion engine. Retries with parse-tolerance like the reference client.
 */
const { spawn } = require('child_process');

const MAX_ATTEMPTS = 3;

function cliBin() {
  return process.env.CLAUDE_BIN || 'claude';
}

// Auth/routing vars that redirect Claude auth to a session proxy. If this Node
// process was itself launched inside a Claude Code session, these are set and
// would shadow the machine's `claude login` — making the spawned CLI 401.
const SHADOWING_ENV_VARS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];

/** Is this env var a Claude Code session marker (which forces session auth)? */
function isSessionMarker(key) {
  return key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE');
}

/**
 * A copy of `baseEnv` with the auth/routing vars and Claude Code session
 * markers removed, so the spawned `claude` authenticates like a fresh terminal
 * (via the machine's `claude login`) instead of inheriting this process's
 * session proxy. Pure — does not mutate the input.
 * @param {NodeJS.ProcessEnv} baseEnv
 */
function sanitizedChildEnv(baseEnv) {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (SHADOWING_ENV_VARS.includes(key) || isSessionMarker(key)) delete env[key];
  }
  return env;
}
function timeoutMs() {
  return Number(process.env.LLM_TIMEOUT_MS) || 120000;
}

// ---------------------------------------------------------------------------
// Prompt serialization (pure)
// ---------------------------------------------------------------------------

function renderBlock(block) {
  switch (block.type) {
    case 'text':
      return block.text;
    case 'tool_call':
      return `[tool_call ${block.name} id=${block.id}] ${JSON.stringify(block.input)}`;
    case 'tool_result':
      return `[tool_result for=${block.toolCallId}${block.isError ? ' ERROR' : ''}] ${block.content}`;
    default:
      return JSON.stringify(block);
  }
}

/**
 * Serialize the conversation into the text piped on stdin.
 * @param {import('../types').LLMMessage[]} messages
 */
function serializeTranscript(messages) {
  return (messages || [])
    .map((m) => `### ${m.role}\n${m.content.map(renderBlock).join('\n')}`)
    .join('\n\n');
}

/**
 * Build the protocol prompt passed via `-p`: system + tool defs + the strict
 * JSON-only reply contract that emulates tool-calling.
 * @param {import('../types').LLMRequest} req
 */
function buildProtocol(req) {
  const parts = [];
  if (req.system) parts.push(req.system);

  if (req.tools && req.tools.length > 0) {
    const toolLines = req.tools
      .map((t) => `- ${t.name}: ${t.description}\n  input JSON Schema: ${JSON.stringify(t.parameters)}`)
      .join('\n');
    parts.push(`You can call these tools:\n${toolLines}`);
  }

  parts.push(
    [
      'The conversation transcript is provided as input.',
      'Reply with ONLY a single JSON object and nothing else — no prose, no code fences.',
      'To call a tool, reply: {"action":"tool","name":"<toolName>","input":{...}}',
      'When you have the final answer, reply: {"action":"final","text":"<answer>"}',
    ].join('\n')
  );

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Response parsing (pure, tolerant)
// ---------------------------------------------------------------------------

/**
 * Parse the CLI `--output-format json` envelope. Returns the parsed envelope
 * (with `.result` and `.usage`); throws if the run reported an error.
 * @param {string} stdout
 */
function parseEnvelope(stdout) {
  let env;
  try {
    env = JSON.parse(stdout);
  } catch (e) {
    throw new Error(`claude-cli: could not parse envelope JSON: ${e.message}`);
  }
  if (env.is_error || env.subtype === 'error' || env.subtype === 'error_max_turns') {
    throw new Error(`claude-cli: run failed: ${env.result || env.subtype || 'unknown error'}`);
  }
  return env;
}

/** Strip a leading/trailing ```json ... ``` fence if present. */
function stripFences(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : text;
}

/** Find the first balanced JSON object in a string, respecting string literals. */
function firstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Extract the emulated tool-calling action object from the model's reply,
 * tolerating code fences and surrounding prose.
 * @param {string} resultStr
 * @returns {{action: string, [k: string]: any}}
 */
function extractActionJson(resultStr) {
  const candidate = firstJsonObject(stripFences(resultStr));
  if (!candidate) {
    throw new Error(`claude-cli: no JSON object found in reply: ${resultStr.slice(0, 200)}`);
  }
  return JSON.parse(candidate);
}

let _idCounter = 0;
function nextToolCallId() {
  _idCounter += 1;
  return `cli_${_idCounter}`;
}

/**
 * Map an emulated action object to a neutral LLMResponse.
 * @param {{action: string, name?: string, input?: Object, text?: string}} action
 * @param {{input_tokens?: number, output_tokens?: number}} usage
 * @returns {import('../types').LLMResponse}
 */
function actionToResponse(action, usage = {}) {
  const neutralUsage = {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  };

  if (action.action === 'final') {
    return { text: action.text ?? '', toolCalls: [], stopReason: 'end', usage: neutralUsage };
  }
  if (action.action === 'tool') {
    return {
      text: '',
      toolCalls: [{ id: nextToolCallId(), name: action.name, input: action.input || {} }],
      stopReason: 'tool_use',
      usage: neutralUsage,
    };
  }
  throw new Error(`claude-cli: unknown action "${action.action}"`);
}

// ---------------------------------------------------------------------------
// Subprocess (async, non-blocking)
// ---------------------------------------------------------------------------

/**
 * Spawn the CLI once and resolve with stdout. Restricts built-in tools so the
 * CLI acts as a pure completion engine.
 */
function runCli(protocol, transcript, model) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      protocol,
      '--model',
      model,
      '--output-format',
      'json',
      // Allowlist a single bogus tool → no real built-in tool is permitted.
      '--allowedTools',
      'none',
    ];
    const child = spawn(cliBin(), args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: sanitizedChildEnv(process.env),
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`claude-cli: timed out after ${timeoutMs()}ms`));
    }, timeoutMs());

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`claude-cli: failed to spawn "${cliBin()}": ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) {
        reject(new Error(`claude-cli: exited ${code}: ${stderr.trim() || 'no output'}`));
      } else {
        resolve(stdout);
      }
    });

    child.stdin.write(transcript);
    child.stdin.end();
  });
}

/** @type {{ name: string, complete: (req: import('../types').LLMRequest, model: string) => Promise<import('../types').LLMResponse> }} */
const claudeCliProvider = {
  name: 'claude-cli',
  async complete(req, model) {
    const protocol = buildProtocol(req);
    const transcript = serializeTranscript(req.messages);

    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const stdout = await runCli(protocol, transcript, model);
        const env = parseEnvelope(stdout);
        const action = extractActionJson(env.result);
        return actionToResponse(action, env.usage);
      } catch (err) {
        lastErr = err;
        // Retry on transient spawn/parse errors (parse-tolerance).
      }
    }
    throw new Error(`claude-cli: failed after ${MAX_ATTEMPTS} attempts: ${lastErr && lastErr.message}`);
  },
};

module.exports = {
  claudeCliProvider,
  buildProtocol,
  serializeTranscript,
  parseEnvelope,
  extractActionJson,
  actionToResponse,
  sanitizedChildEnv,
};
