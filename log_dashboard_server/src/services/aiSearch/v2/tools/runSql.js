/**
 * `run_sql` tool (Phase 0.5).
 *
 * Runs ONE read-only ClickHouse query. Reuses v1's execution primitive
 * (`configs/connection.js`, `JSONEachRow`) but runs the guardrail FIRST and
 * returns `{data}` or `{error}` — it never throws across the agent loop. On a
 * query error the loop feeds the error back to the model as an isError
 * tool_result so it can self-heal (this replaces v1's separate fix step).
 *
 * @param {{ sql: string }} input
 * @returns {Promise<{data: any[]} | {error: string}>}
 */
const connection = require('../db/roConnection');
const { assertReadOnly } = require('./guardrails');

// Max rows fed into the model context. Beyond this we return a sample plus the
// true count and a nudge to aggregate, instead of dumping thousands of rows.
const ROW_CAP = 150;

/**
 * Bound a result set before it enters model context.
 * @param {any[]} rows
 * @param {number} [cap]
 * @returns {{data: any[], rowCount: number, truncated?: boolean, note?: string}}
 */
function capRows(rows, cap = ROW_CAP) {
  if (rows.length <= cap) return { data: rows, rowCount: rows.length };
  return {
    data: rows.slice(0, cap),
    rowCount: rows.length,
    truncated: true,
    note:
      `Returned the first ${cap} of ${rows.length} rows. For a question about all of them, ` +
      `aggregate in SQL (GROUP BY / count / sum) or add a tighter filter or LIMIT instead of scanning raw rows.`,
  };
}

async function runSql(input) {
  const sql = input && input.sql;

  // Guardrail first (throws) — surface as {error}, never throw.
  try {
    assertReadOnly(sql);
  } catch (err) {
    return { error: err.message };
  }

  try {
    const client = await connection.getConnection();
    const result = await client.query({ query: sql, format: 'JSONEachRow' });
    const data = await result.json();
    return capRows(data);
  } catch (err) {
    return { error: `run_sql execution failed: ${err.message}` };
  }
}

module.exports = { runSql, capRows, ROW_CAP };
