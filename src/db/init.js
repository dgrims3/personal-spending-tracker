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

  const seedCategories = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  const seedMany = db.transaction((names) => {
    for (const name of names) seedCategories.run(name);
  });
  seedMany([
    'Produce', 'Dairy', 'Meat', 'Bakery', 'Frozen',
    'Beverages', 'Snacks', 'Household', 'Health & Beauty',
    'Baby', 'Pet', 'Clothing', 'Electronics', 'Gas', 'Dining Out', 'Other',
  ]);

  console.log('Database initialized at', DB_PATH);
}

if (require.main === module) {
  initDb();
  db.close();
  console.log('Done.');
}

module.exports = initDb;
