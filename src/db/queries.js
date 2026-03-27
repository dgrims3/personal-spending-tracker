'use strict';

const db = require('./connection');
const { assertSafeSQL } = require('../services/sql-safety');

/**
 * Insert a receipt and return its ID.
 * @param {string} rawText
 * @returns {number} receipt ID
 */
function insertReceipt(rawText) {
  return db.prepare('INSERT INTO receipts (raw_text) VALUES (?)').run(rawText).lastInsertRowid;
}

/**
 * Insert a line item.
 * @param {number} receiptId
 * @param {string} store
 * @param {string} product
 * @param {string} category
 * @param {string} date - ISO 8601 (YYYY-MM-DD)
 * @param {number} cost
 * @param {number} [quantity]
 */
function insertLineItem(receiptId, store, product, category, date, cost, quantity = 1) {
  db.prepare(`
    INSERT INTO line_items (receipt_id, store, product, category, date, cost, quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(receiptId, store, product, category, date, cost, quantity);
}

/**
 * Get all category names.
 * @returns {string[]}
 */
function getAllCategories() {
  return db.prepare('SELECT name FROM categories ORDER BY name').all().map(r => r.name);
}

/**
 * Insert a category if it doesn't already exist.
 * @param {string} name
 */
function insertCategory(name) {
  db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name);
}

/**
 * Add an item to the review queue.
 * @param {number|null} receiptId
 * @param {string} rawText
 * @param {string} reason
 */
function insertReviewItem(receiptId, rawText, reason) {
  db.prepare('INSERT INTO review_queue (receipt_id, raw_text, reason) VALUES (?, ?, ?)').run(receiptId, rawText, reason);
}

/**
 * Run a validated SELECT query (used for NL-to-SQL results).
 * assertSafeSQL throws before any DB access if the query is unsafe.
 * @param {string} sql
 * @returns {object[]}
 */
function queryLineItems(sql) {
  assertSafeSQL(sql);
  return db.prepare(sql).all();
}

/**
 * Count total users.
 * @returns {number}
 */
function getUserCount() {
  return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
}

/**
 * Get a user by username.
 * @param {string} username
 * @returns {{ id: number, username: string, password_hash: string } | undefined}
 */
function getUserByUsername(username) {
  return db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
}

/**
 * Insert a new user.
 * @param {string} username
 * @param {string} passwordHash
 * @returns {number} user ID
 */
function insertUser(username, passwordHash) {
  return db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash).lastInsertRowid;
}

/**
 * Record a revoked JWT so it cannot be reused after logout.
 * @param {string} jti - The token's unique ID claim
 * @param {string} expiresAt - ISO 8601 datetime when the token naturally expires (for cleanup)
 */
function revokeToken(jti, expiresAt) {
  db.prepare('INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)').run(jti, expiresAt);
}

/**
 * Check whether a JWT jti has been revoked.
 * @param {string} jti
 * @returns {boolean}
 */
function isTokenRevoked(jti) {
  return db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').get(jti) !== undefined;
}

/**
 * Delete revoked_tokens rows whose tokens have already expired.
 * Safe to call on every server startup — keeps the table from growing forever.
 * @returns {number} number of rows deleted
 */
function cleanupExpiredTokens() {
  return db.prepare("DELETE FROM revoked_tokens WHERE expires_at < datetime('now')").run().changes;
}

module.exports = {
  insertReceipt, insertLineItem, getAllCategories, insertCategory,
  insertReviewItem, queryLineItems, getUserCount, getUserByUsername, insertUser,
  revokeToken, isTokenRevoked, cleanupExpiredTokens,
};
