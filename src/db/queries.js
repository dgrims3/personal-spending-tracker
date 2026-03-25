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
 * @param {{store: string, product: string, category: string, date: string, cost: number, quantity: number}} item
 */
function insertLineItem(receiptId, item) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO line_items (receipt_id, store, product, category, date, cost, quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(receiptId, item.store, item.product, item.category, item.date, item.cost, item.quantity ?? 1);
  } finally {
    db.close();
  }
}

/**
 * Get all category names.
 * @returns {string[]}
 */
function getCategories() {
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
function upsertCategory(name) {
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
function runSelectQuery(sql) {
  const db = getDb();
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

module.exports = { insertReceipt, insertLineItem, getCategories, upsertCategory, insertReviewItem, runSelectQuery };
