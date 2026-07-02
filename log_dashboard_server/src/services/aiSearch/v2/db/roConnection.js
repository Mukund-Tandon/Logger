/**
 * Read-only ClickHouse connection for v2 query tools (Phase 3.5).
 *
 * The agent's query tools (run_sql, find_patterns, get_changes) connect as the
 * restricted `log_agent` user (readonly=1 + caps, created by `db:harden:v2`), so
 * even if the read-only regex guardrail is bypassed the DB itself refuses any
 * write. This is a SECOND client instance with different creds — not a second
 * client abstraction. Writes (seed/migrate/trace) still use the admin
 * `configs/connection.js`.
 *
 * Creds are env-overridable so prod can point at real restricted credentials.
 */
const ClickHouse = require('@clickhouse/client');
const admin = require('../../../../configs/connection');

/** Build the read-only client config from env (pure/testable). */
function readOnlyConfig(env = process.env) {
  return {
    url: env.CH_RO_URL || env.CLICKHOUSE_URL || 'http://127.0.0.1:8123',
    username: env.CH_RO_USER || 'log_agent',
    password: env.CH_RO_PASSWORD || '',
    database: env.CH_RO_DATABASE || 'testdb',
  };
}

let _client = null;

/**
 * The read-only client. If `V2_DB_READONLY=off`, fall back to the admin
 * connection (handy before `db:harden:v2` has been run).
 */
async function getReadOnlyConnection() {
  if (process.env.V2_DB_READONLY === 'off') {
    return admin.getConnection();
  }
  if (!_client) {
    _client = ClickHouse.createClient(readOnlyConfig());
  }
  return _client;
}

module.exports = {
  getReadOnlyConnection,
  // alias so query tools can call `connection.getConnection()` uniformly
  getConnection: getReadOnlyConnection,
  readOnlyConfig,
};
