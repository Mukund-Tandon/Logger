/**
 * `find_patterns` tool (Phase 1.1).
 *
 * Clusters log messages in a time window into TEMPLATES by normalizing volatile
 * tokens (UUIDs, IPs, hex, numbers) to placeholders, then GROUP BY template with
 * a count and one example. The normalization runs ClickHouse-native (via
 * replaceRegexpAll) so it scales over the whole window without pulling raw rows
 * into Node. `normalizeTemplate` is the JS mirror of that logic, kept in sync
 * with `buildTemplateExpr` and unit-tested. (Upgrade to Drain3 later.)
 *
 * Returns `{data}` or `{error}` — never throws across the loop.
 */
const connection = require('../db/roConnection');
const { assertReadOnly } = require('./guardrails');

// Token patterns, applied in this order (specific → generic). Each has a JS
// regex (for normalizeTemplate) and an equivalent re2 pattern (for ClickHouse).
const TOKEN_PATTERNS = [
  {
    placeholder: '<UUID>',
    js: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    re2: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
  },
  {
    placeholder: '<IP>',
    js: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    re2: '\\b[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\b',
  },
  {
    placeholder: '<HEX>',
    js: /\b0x[0-9a-fA-F]+\b/g,
    re2: '\\b0x[0-9a-fA-F]+\\b',
  },
  {
    placeholder: '<NUM>',
    js: /\d+/g,
    re2: '[0-9]+',
  },
];

/**
 * Normalize one message into its template (JS mirror of the ClickHouse SQL).
 * @param {string} message
 * @returns {string}
 */
function normalizeTemplate(message) {
  let out = String(message);
  for (const { placeholder, js } of TOKEN_PATTERNS) {
    out = out.replace(js, placeholder);
  }
  return out;
}

/** Build the nested replaceRegexpAll(...) ClickHouse expression for `column`. */
function buildTemplateExpr(column) {
  return TOKEN_PATTERNS.reduce(
    (inner, { re2, placeholder }) =>
      `replaceRegexpAll(${inner}, '${re2}', '${placeholder}')`,
    column
  );
}

/** Escape a single-quoted ClickHouse string literal. */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * @param {{ start?: string, end?: string, level?: string, limit?: number }} input
 * @returns {Promise<{data: any[]} | {error: string}>}
 */
async function findPatterns(input = {}) {
  const { start, end, level } = input;

  if (level !== undefined && typeof level !== 'string') {
    return { error: 'find_patterns: "level" must be a string' };
  }
  if (start !== undefined && typeof start !== 'string') {
    return { error: 'find_patterns: "start" must be an ISO datetime string' };
  }
  if (end !== undefined && typeof end !== 'string') {
    return { error: 'find_patterns: "end" must be an ISO datetime string' };
  }

  let limit = Number.isInteger(input.limit) ? input.limit : 20;
  limit = Math.max(1, Math.min(limit, 200));

  const where = [];
  if (start) where.push(`Timestamp >= parseDateTimeBestEffort(${sqlString(start)})`);
  if (end) where.push(`Timestamp <= parseDateTimeBestEffort(${sqlString(end)})`);
  if (!start && !end) where.push('Timestamp >= now() - INTERVAL 24 HOUR');
  if (level) where.push(`Level = ${sqlString(level)}`);

  const templateExpr = buildTemplateExpr('Message');
  const sql =
    `SELECT ${templateExpr} AS template, count() AS count, any(Message) AS example ` +
    `FROM logs WHERE ${where.join(' AND ')} ` +
    `GROUP BY template ORDER BY count DESC LIMIT ${limit}`;

  // Defense in depth: this query is constructed read-only, but assert it anyway.
  try {
    assertReadOnly(sql);
  } catch (err) {
    return { error: err.message };
  }

  try {
    const client = await connection.getConnection();
    const result = await client.query({ query: sql, format: 'JSONEachRow' });
    const data = await result.json();
    return { data };
  } catch (err) {
    return { error: `find_patterns execution failed: ${err.message}` };
  }
}

module.exports = { findPatterns, normalizeTemplate, buildTemplateExpr };
