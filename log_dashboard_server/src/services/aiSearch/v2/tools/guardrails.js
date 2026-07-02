/**
 * Defense-in-depth guardrails (Phase 0.5).
 *
 * Ported and hardened from v1's `steps/validateSQLQuery.js`. The restricted
 * read-only ClickHouse user (Phase 3.5) is the REAL protection; this is a
 * second layer so a single bypass isn't catastrophic. A read-only query must:
 *   - start with select / show / describe / explain / with
 *   - contain no write/DDL keywords
 *   - be a single statement (no stacked statements after a trailing `;`)
 */

const READ_STARTERS = ['select', 'show', 'describe', 'explain', 'with'];

const WRITE_PATTERNS = [
  /\binsert\b/,
  /\bupdate\b/,
  /\bdelete\b/,
  /\bdrop\b/,
  /\bcreate\b/,
  /\balter\b/,
  /\btruncate\b/,
  /\brename\b/,
  /\breplace\b/,
  /\bmerge\b/,
  /\bgrant\b/,
  /\brevoke\b/,
  /\battach\b/,
  /\bdetach\b/,
  /\boptimize\b/,
  /\bset\b/,
];

/**
 * Throw if `sql` is not a single read-only statement.
 * @param {string} sql
 * @returns {void}
 */
function assertReadOnly(sql) {
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new Error('guardrail: query must be a non-empty string');
  }

  const trimmed = sql.trim();
  const lower = trimmed.toLowerCase();

  // Reject stacked statements: strip a single trailing `;`, then any remaining
  // `;` means more than one statement.
  const withoutTrailing = trimmed.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    throw new Error('guardrail: multi-statement queries are not allowed');
  }

  if (!READ_STARTERS.some((op) => lower.startsWith(op))) {
    throw new Error(
      `guardrail: query must start with one of ${READ_STARTERS.join('/')} (got: ${trimmed.slice(0, 30)}...)`
    );
  }

  for (const pattern of WRITE_PATTERNS) {
    if (pattern.test(lower)) {
      throw new Error(`guardrail: query contains a disallowed write/DDL keyword (${pattern})`);
    }
  }
}

/**
 * Boolean form of {@link assertReadOnly}.
 * @param {string} sql
 * @returns {boolean}
 */
function isReadOnly(sql) {
  try {
    assertReadOnly(sql);
    return true;
  } catch {
    return false;
  }
}

module.exports = { assertReadOnly, isReadOnly };
