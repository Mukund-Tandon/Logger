/**
 * Neutral tool registry (Phase 0.5).
 *
 * Each entry pairs a neutral ToolDef (name/description/parameters as JSON
 * Schema — see ../llm/types.js) with its handler, so the provider-agnostic loop
 * can advertise tools to ANY provider and dispatch calls by name. Handlers
 * return `{data}` or `{error}` and never throw across the loop.
 *
 * @typedef {{ def: import('../llm/types').ToolDef, handler: (input: any) => Promise<{data?: any, error?: string}> }} RegisteredTool
 */
const { runSql } = require('./runSql');
const { getSchema } = require('./getSchema');
const { findPatterns } = require('./findPatterns');
const { getChanges } = require('./getChanges');

/** @type {RegisteredTool[]} */
const registry = [
  {
    def: {
      name: 'run_sql',
      description:
        'Run ONE read-only ClickHouse SQL query against the logs database and return the rows. ' +
        'Only SELECT/SHOW/DESCRIBE/EXPLAIN/WITH are allowed; writes and multi-statement queries are rejected.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'A single read-only SQL statement.' },
        },
        required: ['sql'],
      },
    },
    handler: runSql,
  },
  {
    def: {
      name: 'get_schema',
      description:
        'Return the logs table name, columns, and types so you can write correct SQL.',
      parameters: { type: 'object', properties: {} },
    },
    handler: getSchema,
  },
  {
    def: {
      name: 'find_patterns',
      description:
        'Cluster log messages in a time window into templates (volatile tokens like ids, IPs, and ' +
        'numbers are normalized to placeholders), returning each template with its count and an ' +
        'example. Use this to spot the dominant error/message patterns instead of reading raw rows.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'ISO datetime lower bound (optional).' },
          end: { type: 'string', description: 'ISO datetime upper bound (optional).' },
          level: { type: 'string', description: 'Filter to a single log level, e.g. "ERROR" (optional).' },
          limit: { type: 'integer', description: 'Max templates to return (default 20).' },
        },
      },
    },
    handler: findPatterns,
  },
  {
    def: {
      name: 'get_changes',
      description:
        'Return deploys / config changes from the deployments table within a time window, newest ' +
        'first, with an optional service filter. Use this to correlate a spike or incident with the ' +
        'change that likely caused it (the root-cause headline).',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'ISO datetime lower bound (optional).' },
          end: { type: 'string', description: 'ISO datetime upper bound (optional).' },
          service: { type: 'string', description: 'Filter to one service, e.g. "checkout" (optional).' },
          limit: { type: 'integer', description: 'Max changes to return (default 20).' },
        },
      },
    },
    handler: getChanges,
  },
];

/** Look up a registered tool by its ToolDef name. */
function getTool(name) {
  return registry.find((t) => t.def.name === name);
}

/** The neutral ToolDefs to advertise to a provider. */
function toolDefs() {
  return registry.map((t) => t.def);
}

module.exports = {
  registry,
  getTool,
  toolDefs,
  // Handlers exported directly for unit tests / direct use.
  runSql,
  getSchema,
  findPatterns,
  getChanges,
};
