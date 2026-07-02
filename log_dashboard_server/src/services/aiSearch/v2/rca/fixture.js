/**
 * RCA demo fixture (Phase 2.1).
 *
 * A deterministic, self-contained incident scenario so the RCA path is testable:
 * a deploy of the `checkout` service at 13:58, followed by a spike of ERROR logs
 * (payment-gateway timeouts) at 14:00–14:05, on top of a low baseline before.
 * The agent should quantify the spike, cluster it with find_patterns, correlate
 * it with the deploy via get_changes, and name the deploy as the likely cause.
 *
 * All timestamps are fixed literals (no Date.now) so the scenario is reproducible.
 * Rows are tagged with ResourceID = `checkout` so the seed is idempotent
 * (delete-by-marker before insert).
 */
const SPIKE_SERVICE = 'checkout';
const SPIKE_DATE = '2024-06-15';
const SPIKE_COUNT = 300;
const BASELINE_COUNT = 12;

const DEPLOY = {
  DeployedAt: `${SPIKE_DATE} 13:58:00.000000`,
  Service: SPIKE_SERVICE,
  Version: 'v2.3.1',
  Description: 'checkout v2.3.1 — payment gateway client refactor',
};

/** @returns {Array<{DeployedAt:string,Service:string,Version:string,Description:string}>} */
function deploymentRows() {
  return [{ ...DEPLOY }];
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** The spike: SPIKE_COUNT ERROR rows spread across 14:00:00–14:04:59. */
function spikeLogRows() {
  const rows = [];
  for (let i = 0; i < SPIKE_COUNT; i++) {
    const sec = Math.floor((i * 300) / SPIKE_COUNT); // 0..299
    const ts = `${SPIKE_DATE} 14:${pad(Math.floor(sec / 60))}:${pad(sec % 60)}.000000`;
    rows.push({
      Timestamp: ts,
      Level: 'ERROR',
      Message: `Payment gateway timeout for order ${1000 + i}`,
      ResourceID: SPIKE_SERVICE,
    });
  }
  return rows;
}

/** A low baseline of pre-spike errors (13:00–13:11) so 14:00 reads as a spike. */
function baselineLogRows() {
  const rows = [];
  for (let i = 0; i < BASELINE_COUNT; i++) {
    const ts = `${SPIKE_DATE} 13:${pad(i)}:00.000000`;
    rows.push({
      Timestamp: ts,
      Level: 'ERROR',
      Message: `Payment gateway timeout for order ${i}`,
      ResourceID: SPIKE_SERVICE,
    });
  }
  return rows;
}

module.exports = {
  SPIKE_SERVICE,
  SPIKE_DATE,
  DEPLOY,
  deploymentRows,
  spikeLogRows,
  baselineLogRows,
};
