'use strict';

// Must start with SELECT (after optional whitespace)
const SELECT_RE = /^\s*SELECT\b/i;

// Write operations
const WRITE_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE)\b/i;

// ATTACH/DETACH can read/write arbitrary files on disk
const ATTACH_RE = /\b(ATTACH|DETACH)\b/i;

// PRAGMA can change SQLite journal mode, security settings, etc.
const PRAGMA_RE = /\bPRAGMA\b/i;

// SQL comments can hide injected clauses after the visible query
const COMMENT_RE = /--|\/\*/;

// Semicolons enable multi-statement execution
const SEMICOLON_RE = /;/;

/**
 * Throw if the SQL string is not a safe, single-statement SELECT query.
 * This is a defense-in-depth check — callers should validate before reaching here,
 * but this is the last line of defense before executing LLM-generated SQL.
 *
 * @param {string} sql
 * @throws {Error}
 */
function assertSafeSQL(sql) {
  if (!SELECT_RE.test(sql)) {
    throw new Error('SQL safety violation: only SELECT queries are allowed');
  }
  if (WRITE_RE.test(sql)) {
    throw new Error('SQL safety violation: write operations are not allowed');
  }
  if (ATTACH_RE.test(sql)) {
    throw new Error('SQL safety violation: ATTACH/DETACH is not allowed');
  }
  if (PRAGMA_RE.test(sql)) {
    throw new Error('SQL safety violation: PRAGMA is not allowed');
  }
  if (COMMENT_RE.test(sql)) {
    throw new Error('SQL safety violation: SQL comments are not allowed');
  }
  if (SEMICOLON_RE.test(sql)) {
    throw new Error('SQL safety violation: multi-statement queries are not allowed');
  }
}

module.exports = { assertSafeSQL };
