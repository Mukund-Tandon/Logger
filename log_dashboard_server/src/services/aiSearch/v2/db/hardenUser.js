/**
 * Create the restricted read-only `log_agent` ClickHouse user (Phase 3.5).
 *
 * readonly=1 (only SELECT/SHOW/DESCRIBE, cannot change settings) + blast-radius
 * caps (execution time, result rows). The v2 query tools connect as this user
 * (see roConnection.js) so the read-only guardrail regex is defense-in-depth,
 * not the only protection. Run once: `npm run db:harden:v2`. Idempotent.
 *
 * Uses the admin connection (needs privileges to create users/grants).
 */
require('../loadEnv');
const admin = require('../../../../configs/connection');

const STATEMENTS = [
  `CREATE USER IF NOT EXISTS log_agent IDENTIFIED WITH no_password
     SETTINGS max_execution_time = 20, max_result_rows = 1000000, readonly = 1`,
  `GRANT SELECT ON testdb.* TO log_agent`,
];

async function harden() {
  const client = await admin.getConnection();
  for (const query of STATEMENTS) {
    await client.command({ query });
  }
  return { ok: true };
}

if (require.main === module) {
  harden()
    .then(() => {
      console.log('log_agent user ready (readonly=1, SELECT on testdb.*)');
      process.exit(0);
    })
    .catch((err) => {
      console.error('harden failed:', err.message);
      process.exit(1);
    });
}

module.exports = { harden, STATEMENTS };
