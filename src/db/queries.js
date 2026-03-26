const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/receipts.db';

/**
 * Open a database connection.
 * @returns {Database}
 */
function getDb() {
  return new Database(DB_PATH);
}

/**
 * Insert a receipt and return its ID.
 * @param {string} rawText
 * @returns {number} receipt ID
 */
function insertReceipt(rawText) {
  const db = getDb();
  try {
    const result = db.prepare('INSERT INTO receipts (raw_text) VALUES (?)').run(rawText);
    return result.lastInsertRowid;
  } finally {
    db.close();
  }
}

/**
 * Insert a line item.
 * @param {number} receiptId
 * @param {string} store
 * @param {string} product
 * @param {string} category
 * @param {string} date - ISO 8601 (YYYY-MM-DD)
 * @param {number} cost
 * @param {number} quantity
 */
function insertLineItem(receiptId, store, product, category, date, cost, quantity = 1) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO line_items (receipt_id, store, product, category, date, cost, quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(receiptId, store, product, category, date, cost, quantity);
  } finally {
    db.close();
  }
}

/**
 * Get all category names.
 * @returns {string[]}
 */
function getAllCategories() {
  const db = getDb();
  try {
    return db.prepare('SELECT name FROM categories ORDER BY name').all().map(r => r.name);
  } finally {
    db.close();
  }
}

/**
 * Insert a category if it doesn't already exist.
 * @param {string} name
 */
function insertCategory(name) {
  const db = getDb();
  try {
    db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name);
  } finally {
    db.close();
  }
}

/**
 * Add an item to the review queue.
 * @param {number|null} receiptId
 * @param {string} rawText
 * @param {string} reason
 */
function insertReviewItem(receiptId, rawText, reason) {
  const db = getDb();
  try {
    db.prepare('INSERT INTO review_queue (receipt_id, raw_text, reason) VALUES (?, ?, ?)').run(receiptId, rawText, reason);
  } finally {
    db.close();
  }
}

/**
 * Run a raw SELECT query (used for NL-to-SQL results).
 * @param {string} sql
 * @returns {object[]}
 */
function queryLineItems(sql) {
  const db = getDb();
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

/**
 * Count total users.
 * @returns {number}
 */
function getUserCount() {
  const db = getDb();
  try {
    return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  } finally {
    db.close();
  }
}

/**
 * Get a user by username.
 * @param {string} username
 * @returns {{ id: number, username: string, password_hash: string } | undefined}
 */
function getUserByUsername(username) {
  const db = getDb();
  try {
    return db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
  } finally {
    db.close();
  }
}

/**
 * Insert a new user.
 * @param {string} username
 * @param {string} passwordHash
 * @returns {number} user ID
 */
function insertUser(username, passwordHash) {
  const db = getDb();
  try {
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    return result.lastInsertRowid;
  } finally {
    db.close();
  }
}

module.exports = {
  insertReceipt, insertLineItem, getAllCategories, insertCategory,
  insertReviewItem, queryLineItems, getUserCount, getUserByUsername, insertUser,
};
