/**
 * Seed the RCA demo scenario (Phase 2.1). Idempotent: it deletes any prior
 * seeded rows (matched by the `checkout` marker / fixture window) before
 * re-inserting, so re-running is safe. Run: `npm run db:seed:v2`.
 *
 * Plants: 1 deploy (checkout v2.3.1 @ 13:58) + a low baseline of errors +
 * a spike of ~300 payment-gateway-timeout ERROR logs @ 14:00–14:05.
 */
require('../loadEnv');
const connection = require('../../../../configs/connection');
const { migrate } = require('./migrate');
const {
  SPIKE_SERVICE,
  SPIKE_DATE,
  deploymentRows,
  spikeLogRows,
  baselineLogRows,
} = require('./fixture');

async function seed() {
  await migrate();
  const client = await connection.getConnection();

  // Idempotency: remove previously seeded rows (mutations on MergeTree).
  await client.command({
    query: `ALTER TABLE logs DELETE WHERE ResourceID = '${SPIKE_SERVICE}' AND toDate(Timestamp) = toDate('${SPIKE_DATE}')`,
  });
  await client.command({
    query: `TRUNCATE TABLE deployments`,
  });

  await client.insert({
    table: 'deployments',
    values: deploymentRows(),
    format: 'JSONEachRow',
  });

  const logRows = [...baselineLogRows(), ...spikeLogRows()];
  await client.insert({ table: 'logs', values: logRows, format: 'JSONEachRow' });

  return { deployments: deploymentRows().length, logs: logRows.length };
}

if (require.main === module) {
  seed()
    .then((r) => {
      console.log(`seeded: ${r.deployments} deploy(s), ${r.logs} log row(s)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('seed failed:', err.message);
      process.exit(1);
    });
}

module.exports = { seed };
