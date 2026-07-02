/**
 * Load `.env` for standalone v2 scripts (eval / dev / trace / seed / migrate /
 * harden). MUST be required FIRST — before `config/models.js` (which reads
 * LLM_PROVIDER at import time) or any provider. The server (`src/index.js`)
 * loads .env itself; this is for the scripts run directly via `node`/`npm run`.
 *
 * Path is resolved relative to this file so it works from any cwd.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

module.exports = {};
