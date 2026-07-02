/**
 * CLI runner for v2.
 *
 *   npm run dev:v2 "<question>"   → prints executeAISearchV2's response
 *   npm run dev:v2 hello          → calls the configured agent provider with a
 *                                   plain "hello" and prints the text it returns
 *                                   (Phase 0.3 smoke test of the Anthropic adapter)
 *
 * Loads the repo .env so ANTHROPIC_API_KEY / CLAUDE_KEY is available.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const { executeAISearchV2 } = require('./index');
const { getProvider } = require('./llm/provider');
const models = require('../../../../config/models');

async function hello() {
  const provider = getProvider('agent');
  const res = await provider.complete(
    {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      maxTokens: 64,
    },
    models.agent.model
  );
  console.log(`[${provider.name} / ${models.agent.model}] → ${res.text}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'hello') {
    await hello();
    return;
  }
  const message = args.join(' ') || 'why did errors spike at 2pm?';
  const result = await executeAISearchV2(message);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
