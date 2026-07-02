/**
 * Pure eval assertions (Phase 3.1). Given a golden case and an
 * executeAISearchV2 result, decide pass/fail with human-readable failures.
 * No LLM or DB here — trivially unit-testable.
 */

/**
 * Tool names called across a transcript, in order.
 * @param {import('../llm/types').LLMMessage[]} transcript
 * @returns {string[]}
 */
function extractToolCalls(transcript) {
  return (transcript || [])
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => (m.content || []).filter((b) => b.type === 'tool_call').map((b) => b.name));
}

/**
 * @typedef {Object} GoldenCase
 * @property {string} id
 * @property {string} question
 * @property {string[]} [must_call]       tools that MUST be called
 * @property {string[]} [must_not_call]   tools that must NOT be called
 * @property {string[]} [answer_matches]  substrings the answer must contain (case-insensitive)
 * @property {boolean}  [expect_reject]   the router should reject this question
 *
 * @param {GoldenCase} testCase
 * @param {{type: string, message: string, transcript?: any[]}} result
 * @returns {{id: string, pass: boolean, failures: string[]}}
 */
function evaluateCase(testCase, result) {
  const failures = [];

  if (testCase.expect_reject) {
    if (result.type !== 'rejected') {
      failures.push(`expected a rejection, got type="${result.type}"`);
    }
    return { id: testCase.id, pass: failures.length === 0, failures };
  }

  if (result.type !== 'success') {
    failures.push(`expected type="success", got "${result.type}" (${result.message || ''})`);
    // no transcript/answer to check further
    return { id: testCase.id, pass: false, failures };
  }

  const called = extractToolCalls(result.transcript);
  for (const tool of testCase.must_call || []) {
    if (!called.includes(tool)) failures.push(`must_call: "${tool}" was not called (called: ${called.join(', ') || 'none'})`);
  }
  for (const tool of testCase.must_not_call || []) {
    if (called.includes(tool)) failures.push(`must_not_call: "${tool}" was called`);
  }

  const answer = (result.message || '').toLowerCase();
  for (const sub of testCase.answer_matches || []) {
    if (!answer.includes(String(sub).toLowerCase())) failures.push(`answer_matches: missing "${sub}"`);
  }

  return { id: testCase.id, pass: failures.length === 0, failures };
}

module.exports = { extractToolCalls, evaluateCase };
