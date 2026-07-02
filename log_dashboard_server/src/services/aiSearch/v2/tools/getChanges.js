/**
 * `get_changes` tool (Phase 2.2).
 *
 * Returns deploy/config-change events from the `deployments` table within a time
 * window, newest first, with an optional service filter. This is the RCA
 * headline: correlate a log-anomaly window with the change that likely caused it.
 *
 * Returns `{data}` or `{error}` — never throws across the loop.
 */
const connection = require('../db/roConnection');
const { assertReadOnly } = require('./guardrails');

/** Escape a single-quoted ClickHouse string literal. */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Build the SELECT for deployment changes. Pure.
 * @param {{start?: string, end?: string, service?: string, limit?: number}} input
 */
function buildChangesSql(input = {}) {
  const { start, end, service } = input;
  let limit = Number.isInteger(input.limit) ? input.limit : 20;
  limit = Math.max(1, Math.min(limit, 200));

  const where = [];
  if (start) where.push(`DeployedAt >= parseDateTimeBestEffort(${sqlString(start)})`);
  if (end) where.push(`DeployedAt <= parseDateTimeBestEffort(${sqlString(end)})`);
  if (service) where.push(`Service = ${sqlString(service)}`);

  const whereClause = where.length ? `WHERE ${where.join(' AND ')} ` : '';
  return (
    `SELECT DeployedAt, Service, Version, Description ` +
    `FROM deployments ${whereClause}` +
    `ORDER BY DeployedAt DESC LIMIT ${limit}`
  );
}

/**
 * @param {{start?: string, end?: string, service?: string, limit?: number}} input
 * @returns {Promise<{data: any[]} | {error: string}>}
 */
async function getChanges(input = {}) {
  const { start, end, service } = input;
  if (service !== undefined && typeof service !== 'string') {
    return { error: 'get_changes: "service" must be a string' };
  }
  if (start !== undefined && typeof start !== 'string') {
    return { error: 'get_changes: "start" must be an ISO datetime string' };
  }
  if (end !== undefined && typeof end !== 'string') {
    return { error: 'get_changes: "end" must be an ISO datetime string' };
  }

  const sql = buildChangesSql(input);

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
    return { error: `get_changes execution failed: ${err.message}` };
  }
}

module.exports = { getChanges, buildChangesSql };
