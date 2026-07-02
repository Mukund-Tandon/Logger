/**
 * `get_schema` tool (Phase 0.5).
 *
 * Returns the logs table columns/types, reusing v1's schema loader
 * (`tableConfiguration.js` → `tableSchema.json`). Returns `{data}` or `{error}`;
 * never throws across the loop.
 *
 * @returns {Promise<{data: any} | {error: string}>}
 */
const { getTableConfigurationJson } = require('../../../tableConfiguration');

async function getSchema() {
  try {
    const json = await getTableConfigurationJson();
    return { data: JSON.parse(json) };
  } catch (err) {
    return { error: `get_schema failed: ${err.message}` };
  }
}

module.exports = { getSchema };
