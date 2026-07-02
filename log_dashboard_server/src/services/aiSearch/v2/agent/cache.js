/**
 * Answer cache keyed on the normalized question (Phase 3.4).
 *
 * A small in-memory TTL cache so repeated questions return instantly without
 * re-running the agent. "Semantic" here is normalization-based (lowercase,
 * collapse whitespace, strip trailing punctuation) — a cheap, dependency-free
 * approximation. Upgrade path: embed the question and match by cosine
 * similarity (ClickHouse ANN) for true semantic hits.
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

const store = new Map(); // key -> { value, expiresAt }

/** Normalize a question into a cache key. */
function normalizeQuestion(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?!.,;:]+$/g, '') // drop trailing punctuation (after trimming space)
    .trim();
}

function get(key, now = Date.now()) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs = DEFAULT_TTL_MS, now = Date.now()) {
  store.set(key, { value, expiresAt: now + ttlMs });
}

function clear() {
  store.clear();
}

module.exports = { normalizeQuestion, get, set, clear, DEFAULT_TTL_MS };
