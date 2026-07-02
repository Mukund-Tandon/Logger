/**
 * Investigation tracing (Phase 3.3). One `agent_runs` row per investigation
 * (steps, tools, tokens, latency, answer, error) written to ClickHouse, so you
 * can query cost/latency/quality and graduate failures into `golden.jsonl`.
 *
 * Tracing must NEVER break a request: recordRun swallows all errors.
 * `buildRunRow` is a pure mapper (unit-tested); `npm run trace` prints recent runs.
 */
require('../loadEnv'); // load .env for `npm run trace`
const connection = require('../../../../configs/connection');
const { estimateCost } = require('../../../../../config/pricing');

const ANSWER_CAP = 2000;

const AGENT_RUNS_DDL = `
CREATE TABLE IF NOT EXISTS agent_runs (
  RunAt        DateTime64(3),
  Question     String,
  Provider     String,
  Model        String,
  Steps        UInt16,
  Tools        Array(String),
  InputTokens  UInt64,
  OutputTokens UInt64,
  LatencyMs    UInt32,
  Answer       String,
  Error        String,
  Rejected     UInt8
) ENGINE = MergeTree ORDER BY RunAt`;

/** ClickHouse DateTime64(3) literal: "YYYY-MM-DD HH:MM:SS.mmm". */
function toChDateTime(d) {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function cap(s, n = ANSWER_CAP) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n) : str;
}

/** Tool names called across the transcript, in order. */
function toolsOf(transcript) {
  return (transcript || [])
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => (m.content || []).filter((b) => b.type === 'tool_call').map((b) => b.name));
}

/**
 * Map an investigation into a flat agent_runs row. Pure.
 * @param {Object} run
 * @param {Date} [at]
 */
function buildRunRow(run, at = new Date()) {
  const usage = run.usage || {};
  return {
    RunAt: toChDateTime(at),
    Question: cap(run.question, 500),
    Provider: run.provider || '',
    Model: run.model || '',
    Steps: run.steps || 0,
    Tools: toolsOf(run.transcript),
    InputTokens: usage.inputTokens || 0,
    OutputTokens: usage.outputTokens || 0,
    LatencyMs: run.latencyMs || 0,
    Answer: run.error ? '' : cap(run.answer),
    Error: cap(run.error, 1000),
    Rejected: run.rejected ? 1 : 0,
  };
}

/**
 * Reduce the events emitted by investigateStream into the fields a trace row
 * needs (tools called, final answer, steps, token usage, rejected). Pure.
 * @param {Array<{type:string,[k:string]:any}>} events
 */
function summarizeStreamEvents(events) {
  const tools = [];
  let answer = '';
  let steps = 0;
  let rejected = false;
  let usage;
  for (const ev of events || []) {
    if (ev.type === 'tool_call') tools.push(ev.name);
    else if (ev.type === 'answer') {
      answer = ev.message || '';
      steps = ev.steps || 0;
      usage = ev.usage;
    } else if (ev.type === 'rejected') {
      rejected = true;
      answer = ev.message || '';
    }
  }
  return { tools, answer, steps, rejected, usage };
}

let _tableReady = false;
async function ensureTable(client) {
  if (_tableReady) return;
  await client.command({ query: AGENT_RUNS_DDL });
  _tableReady = true;
}

/**
 * Insert one trace row. Never throws — a tracing failure must not break the
 * request; it logs and returns { ok: false }.
 */
async function recordRun(run) {
  try {
    const client = await connection.getConnection();
    await ensureTable(client);
    await client.insert({ table: 'agent_runs', values: [buildRunRow(run)], format: 'JSONEachRow' });
    return { ok: true };
  } catch (err) {
    console.error('[trace] failed to record run:', err.message);
    return { ok: false, error: err.message };
  }
}

/** Print the most recent runs (for `npm run trace`). */
async function printRecent(limit = 20) {
  const client = await connection.getConnection();
  await ensureTable(client);
  const result = await client.query({
    query: `SELECT RunAt, Provider, Model, Steps, Tools, InputTokens, OutputTokens, LatencyMs, Rejected, substring(Error,1,60) AS Err, substring(Answer,1,80) AS Ans FROM agent_runs ORDER BY RunAt DESC LIMIT ${Number(limit) || 20}`,
    format: 'JSONEachRow',
  });
  const rows = await result.json();
  console.log(`\nLast ${rows.length} agent runs:\n`);
  for (const r of rows) {
    const cost = estimateCost({
      model: r.Model,
      inputTokens: Number(r.InputTokens),
      outputTokens: Number(r.OutputTokens),
    });
    console.log(
      `${r.RunAt} | ${r.Model} | ${r.Steps} steps | [${(r.Tools || []).join(',')}] | ` +
        `${r.InputTokens}→${r.OutputTokens} tok | $${cost.toFixed(4)} | ${r.LatencyMs}ms | ` +
        `${r.Rejected ? 'REJECTED' : r.Err ? `ERR: ${r.Err}` : r.Ans}`
    );
  }
}

if (require.main === module) {
  printRecent(Number(process.argv[2]) || 20)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { buildRunRow, recordRun, printRecent, summarizeStreamEvents, AGENT_RUNS_DDL };
