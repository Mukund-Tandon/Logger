/**
 * RCA fixture test (Phase 2.3).
 *
 * Drives the REAL agent loop with the REAL tools (run_sql, find_patterns,
 * get_changes) against the seeded incident in ClickHouse. The LLM's decisions
 * are scripted (the sandbox blocks live models), but the scripted brain reads
 * each tool_result out of the transcript — so the deploy it cites is genuinely
 * the one get_changes returned from the database, not a hardcoded string. This
 * proves the RCA trajectory quantify → find_patterns → get_changes → cite works
 * end to end and names the deploy as the likely cause.
 *
 * Requires the seed: `npm run db:seed:v2`.
 */
const { executeAISearchV2 } = require('../index');
const { seed } = require('./seed');

// A scripted "agent" that follows the RCA playbook, reading tool outputs from
// the transcript the loop feeds back to it.
function lastToolResult(req) {
  const toolMsg = [...req.messages].reverse().find((m) => m.role === 'tool');
  return toolMsg ? JSON.parse(toolMsg.content[0].content) : null;
}

function rcaBrain() {
  let step = 0;
  return {
    name: 'rca-scripted',
    async complete(req) {
      step += 1;
      if (step === 1) {
        // quantify: bucket errors by minute around the incident
        return {
          text: 'Quantifying the spike.',
          toolCalls: [
            {
              id: 'q1',
              name: 'run_sql',
              input: {
                sql:
                  "SELECT toStartOfMinute(Timestamp) m, count() c FROM logs " +
                  "WHERE ResourceID='checkout' AND Timestamp BETWEEN '2024-06-15 13:55:00' AND '2024-06-15 14:06:00' " +
                  'GROUP BY m ORDER BY m',
              },
            },
          ],
          stopReason: 'tool_use',
          usage: {},
        };
      }
      if (step === 2) {
        // characterize: what's dominating the window
        return {
          text: 'Finding the dominant pattern.',
          toolCalls: [
            { id: 'p1', name: 'find_patterns', input: { start: '2024-06-15 14:00:00', end: '2024-06-15 14:05:00', level: 'ERROR' } },
          ],
          stopReason: 'tool_use',
          usage: {},
        };
      }
      if (step === 3) {
        // correlate: deploys just before the window
        return {
          text: 'Checking recent deploys.',
          toolCalls: [
            { id: 'c1', name: 'get_changes', input: { start: '2024-06-15 13:00:00', end: '2024-06-15 14:00:00', service: 'checkout' } },
          ],
          stopReason: 'tool_use',
          usage: {},
        };
      }
      // conclude: cite the deploy returned by get_changes
      const changes = lastToolResult(req);
      const deploy = changes.data[0];
      return {
        text:
          `The spike in checkout ERROR logs at 14:00 (payment gateway timeouts) most likely stems from ` +
          `the deploy ${deploy.Service} ${deploy.Version} at ${deploy.DeployedAt} — ${deploy.Description}.`,
        toolCalls: [],
        stopReason: 'end',
        usage: {},
      };
    },
  };
}

describe('RCA fixture — seeded spike + deploy', () => {
  beforeAll(async () => {
    await seed();
  }, 30000);

  it('names the deploy as the likely cause and cites it', async () => {
    const res = await executeAISearchV2('why did checkout errors spike at 2pm?', [], {
      classify: async () => 'accept',
      provider: rcaBrain(),
    });

    expect(res.type).toBe('success');
    // cites the specific deploy that get_changes returned from the DB
    expect(res.message).toContain('v2.3.1');
    expect(res.message).toMatch(/checkout/i);
    expect(res.message).toMatch(/deploy/i);

    // trajectory actually ran all three RCA tools
    const toolNames = res.transcript
      .filter((m) => m.role === 'assistant')
      .flatMap((m) => m.content.filter((b) => b.type === 'tool_call').map((b) => b.name));
    expect(toolNames).toEqual(['run_sql', 'find_patterns', 'get_changes']);
  });
});
