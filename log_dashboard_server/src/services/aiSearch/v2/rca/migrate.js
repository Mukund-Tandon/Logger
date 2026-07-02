/**
 * Migration for the RCA `deployments` table (Phase 2.1).
 *
 * Holds deploy/config-change events. `get_changes` queries this in a window to
 * correlate a log spike with the change that likely caused it. Idempotent
 * (CREATE TABLE IF NOT EXISTS). Run: `npm run db:migrate:v2`.
 */
require('../loadEnv');
const connection = require('../../../../configs/connection');

const DEPLOYMENTS_DDL = `
CREATE TABLE IF NOT EXISTS deployments (
  DeployedAt   DateTime64(6),
  Service      String,
  Version      String,
  Description  String
) ENGINE = MergeTree ORDER BY DeployedAt`;

async function migrate() {
  const client = await connection.getConnection();
  await client.command({ query: DEPLOYMENTS_DDL });
  return { ok: true };
}

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('deployments table ready');
      process.exit(0);
    })
    .catch((err) => {
      console.error('migrate failed:', err.message);
      process.exit(1);
    });
}

module.exports = { migrate, DEPLOYMENTS_DDL };
