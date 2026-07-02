/**
 * Golden-set eval runner (Phase 3.1). Loads `golden.jsonl`, runs each case
 * through the v2 agent, checks the assertions (incl. `must_call` trajectory
 * checks), prints a pass rate, and exits non-zero on any failure so it can gate
 * CI. Wired to `npm run eval`.
 *
 * The orchestration (`loadGolden`/`runGolden`/`formatReport`) is separated from
 * the actual agent call so it's unit-testable with a fake runner (no LLM).
 */
require('../loadEnv'); // load .env before config/models is evaluated
const fs = require('fs');
const path = require('path');
const { evaluateCase } = require('./assertions');
const { judge } = require('./judge');
const { estimateCost } = require('../../../../../config/pricing');
const models = require('../../../../../config/models');

/** Parse golden.jsonl → cases[], skipping blanks and the `_comment` line. */
function loadGolden(file = path.resolve(__dirname, 'golden.jsonl')) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((c) => c && c.id && !c._comment);
}

/**
 * Run every case through `runFn(question) → result` and evaluate it.
 * @param {import('./assertions').GoldenCase[]} cases
 * @param {(question: string, testCase: object) => Promise<object>} runFn
 */
async function runGolden(cases, runFn, opts = {}) {
  // Cases with a `judge` rubric are additionally graded by the judge model.
  const judgeFn = opts.judgeFn || ((question, answer, rubric) => judge({ question, answer, rubric }));
  const model = opts.model || models.agent.model;

  const results = [];
  // Cost/latency/step scorecard — production evals compare configs on more than
  // just correctness (see cost note: input & output tokens priced separately).
  const totals = { inputTokens: 0, outputTokens: 0, latencyMs: 0, steps: 0, costUsd: 0 };

  for (const testCase of cases) {
    let outcome;
    try {
      const startedAt = Date.now();
      const result = await runFn(testCase.question, testCase);
      const latencyMs = Date.now() - startedAt;
      outcome = evaluateCase(testCase, result);

      if (testCase.judge && result.type === 'success') {
        const verdict = await judgeFn(testCase.question, result.message, testCase.judge);
        outcome.judge = verdict;
        if (!verdict.pass) {
          outcome.pass = false;
          outcome.failures.push(`judge: ${verdict.reason}`);
        }
      }

      const usage = result.usage || {};
      const inTok = usage.inputTokens || 0;
      const outTok = usage.outputTokens || 0;
      totals.inputTokens += inTok;
      totals.outputTokens += outTok;
      totals.latencyMs += latencyMs;
      totals.steps += result.steps || 0;
      totals.costUsd += estimateCost({ model, inputTokens: inTok, outputTokens: outTok });
      outcome.metrics = { inputTokens: inTok, outputTokens: outTok, latencyMs, steps: result.steps || 0 };
    } catch (err) {
      outcome = { id: testCase.id, pass: false, failures: [`threw: ${err.message}`] };
    }
    results.push(outcome);
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const n = total || 1;
  return {
    results,
    passed,
    total,
    passRate: total ? passed / total : 0,
    scorecard: {
      model,
      totalInputTokens: totals.inputTokens,
      totalOutputTokens: totals.outputTokens,
      totalCostUsd: totals.costUsd,
      perQueryCostUsd: totals.costUsd / n,
      avgLatencyMs: Math.round(totals.latencyMs / n),
      avgSteps: totals.steps / n,
    },
  };
}

function formatReport(summary) {
  const lines = summary.results.map(
    (r) => `  ${r.pass ? '✓' : '✗'} ${r.id}${r.pass ? '' : `\n      - ${r.failures.join('\n      - ')}`}`
  );
  const pct = Math.round(summary.passRate * 100);
  const s = summary.scorecard || {};
  const usd = (n) => `$${(n || 0).toFixed(4)}`;
  return [
    'Golden eval results:',
    ...lines,
    '',
    `Pass rate:  ${summary.passed}/${summary.total} (${pct}%)`,
    `Model:      ${s.model || '?'}`,
    `Tokens:     ${s.totalInputTokens || 0} in / ${s.totalOutputTokens || 0} out`,
    `Est. cost:  ${usd(s.totalCostUsd)} total · ${usd(s.perQueryCostUsd)}/query`,
    `Latency:    ${s.avgLatencyMs || 0}ms avg · Steps: ${(s.avgSteps || 0).toFixed(1)} avg`,
  ].join('\n');
}

async function main() {
  const { executeAISearchV2 } = require('../index');
  const cases = loadGolden();
  console.log(`Running ${cases.length} golden cases…\n`);
  const summary = await runGolden(cases, (question) => executeAISearchV2(question));
  console.log(formatReport(summary));
  process.exit(summary.passed === summary.total ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { loadGolden, runGolden, formatReport };
