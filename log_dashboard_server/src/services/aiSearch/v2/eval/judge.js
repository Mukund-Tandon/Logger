/**
 * LLM-as-judge (Phase 3.2). Grades an open-ended answer (e.g. an RCA) against a
 * rubric using the cheap `judge` role, returning `{pass, reason}`. Used by
 * runEval for cases that carry a `judge` rubric — trajectory/substring checks
 * catch structure, the judge catches whether the answer is actually correct.
 */
const { getProvider } = require('../llm/provider');
const models = require('../../../../../config/models');

/** Build the grading prompt. Instructs the judge to reply with ONLY JSON. */
function buildJudgePrompt(question, answer, rubric) {
  return [
    'You are a strict grader for a log-analysis assistant. Decide whether the ANSWER satisfies the RUBRIC for the QUESTION.',
    '',
    `QUESTION: ${question}`,
    `RUBRIC (what a correct answer must do): ${rubric}`,
    `ANSWER: ${answer}`,
    '',
    'Reply with ONLY a JSON object, no prose, no code fences:',
    '{"pass": true|false, "reason": "<one sentence>"}',
  ].join('\n');
}

const TRUTHY = new Set(['true', 'yes', 'pass', 'passed', '1']);

/** Tolerantly parse the judge's reply into `{pass, reason}`. Fails closed. */
function parseVerdict(text) {
  const raw = String(text || '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(body.slice(start, end + 1));
      const pass = typeof obj.pass === 'boolean' ? obj.pass : TRUTHY.has(String(obj.pass).toLowerCase());
      return { pass, reason: obj.reason ? String(obj.reason) : '(no reason given)' };
    } catch {
      /* fall through */
    }
  }
  return { pass: false, reason: `could not parse judge verdict: ${raw.slice(0, 120)}` };
}

/**
 * Grade one answer.
 * @param {{question: string, answer: string, rubric: string}} input
 * @param {{provider?: {complete: Function}, model?: string}} [opts]
 * @returns {Promise<{pass: boolean, reason: string}>}
 */
async function judge({ question, answer, rubric }, opts = {}) {
  const provider = opts.provider || getProvider('judge');
  const model = opts.model || models.judge.model;
  try {
    const res = await provider.complete(
      {
        system: 'You are a strict, terse grader. Output only the requested JSON.',
        messages: [{ role: 'user', content: [{ type: 'text', text: buildJudgePrompt(question, answer, rubric) }] }],
        maxTokens: 200,
        temperature: 0,
      },
      model
    );
    return parseVerdict(res.text);
  } catch (err) {
    return { pass: false, reason: `judge error: ${err.message}` };
  }
}

module.exports = { buildJudgePrompt, parseVerdict, judge };
