const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/receipts.db';

/**
 * Initialize the database, creating tables if they don't exist.
 * @returns {Database} The opened database instance
 */
function initDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

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
  return db;
}

if (require.main === module) {
  const db = initDb();
  db.close();
  console.log('Done.');
}

module.exports = initDb;
