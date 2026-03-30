'use strict';

// When run directly (node src/db/init.js), load .env before the connection
// module opens the database file so DB_PATH is resolved correctly.
if (require.main === module) {
  require('dotenv').config();
}

const db = require('./connection');

const DB_PATH = process.env.DB_PATH || './data/receipts.db';

/**
 * Initialize the database, creating all tables if they don't exist.
 */
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_text TEXT NOT NULL,
      scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL,
      store TEXT NOT NULL,
      product TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      cost REAL NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (receipt_id) REFERENCES receipts(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sub_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category_id INTEGER REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS review_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER,
      raw_text TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );
  `);

  // Seed parent categories
  const seedCategory = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  const seedCategories = db.transaction((names) => {
    for (const name of names) seedCategory.run(name);
  });
  seedCategories([
    'Groceries', 'Household', 'Health & Beauty', 'Baby', 'Pet',
    'Clothing', 'Electronics', 'Transportation', 'Dining',
    'Utilities', 'Healthcare', 'Entertainment', 'Other',
  ]);

  // Seed sub-categories with their parent category mappings
  const getCategoryId = db.prepare('SELECT id FROM categories WHERE name = ?');
  const seedSub = db.prepare('INSERT OR IGNORE INTO sub_categories (name, category_id) VALUES (?, ?)');
  const seedSubs = db.transaction((entries) => {
    for (const [subName, parentName] of entries) {
      const parent = getCategoryId.get(parentName);
      seedSub.run(subName, parent ? parent.id : null);
    }
  });
  seedSubs([
    ['Produce', 'Groceries'], ['Dairy', 'Groceries'], ['Meat', 'Groceries'],
    ['Bakery', 'Groceries'], ['Frozen', 'Groceries'], ['Beverages', 'Groceries'],
    ['Snacks', 'Groceries'], ['Household', 'Household'], ['Health & Beauty', 'Health & Beauty'],
    ['Baby', 'Baby'], ['Pet', 'Pet'], ['Clothing', 'Clothing'],
    ['Electronics', 'Electronics'], ['Gas', 'Transportation'],
    ['Dining Out', 'Dining'], ['Other', 'Other'],
  ]);

  console.log('Database initialized at', DB_PATH);
}

if (require.main === module) {
  initDb();
  db.close();
  console.log('Done.');
}

module.exports = initDb;
