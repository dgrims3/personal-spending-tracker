# Codebase Update Instructions

The SQLite database has already been manually updated. This document describes the new schema and every code change needed to make the app work with it.

## What Changed in the Database

### 1. Old `categories` table renamed to `sub_categories`

The table that was called `categories` (holding granular names like "Produce", "Dairy", "Meat") is now called `sub_categories`. It has a new column:

```sql
CREATE TABLE sub_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    category_id INTEGER REFERENCES categories(id)
);
```

### 2. New `categories` table (broad parent categories)

```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);
```

Current rows:

| id | name |
|----|------|
| 1  | Groceries |
| 2  | Household |
| 3  | Health & Beauty |
| 4  | Baby |
| 5  | Pet |
| 6  | Clothing |
| 7  | Electronics |
| 8  | Transportation |
| 9  | Dining |
| 10 | Utilities |
| 11 | Healthcare |
| 12 | Entertainment |
| 13 | Other |

### 3. `line_items` table is unchanged

`line_items.category` still holds the sub-category name (e.g. "Dairy"). No column was added or removed. The sub-category-to-category relationship lives in the `sub_categories` table; queries can JOIN through it to get the parent category.

### 4. Mapping of existing sub_categories to parent categories

| sub_category | parent category |
|---|---|
| Produce, Dairy, Meat, Bakery, Frozen, Beverages, Snacks | Groceries |
| Household | Household |
| Health & Beauty | Health & Beauty |
| Baby | Baby |
| Pet | Pet |
| Clothing | Clothing |
| Electronics | Electronics |
| Gas | Transportation |
| Dining Out | Dining |
| Other | Other |

---

## Code Changes Required

### 1. `src/db/init.js`

**Rename the old `categories` CREATE TABLE to `sub_categories`:**

Replace:
```js
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
```

With:
```js
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS sub_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category_id INTEGER REFERENCES categories(id)
);
```

**Update the seed data** to seed both tables. Replace the entire seed block (lines 63-71) with:

```js
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
```

---

### 2. `src/db/queries.js`

**`getAllCategories()`** — This function is used to populate LLM prompts with the list of available categories. It must now return both parent categories and sub-categories so the LLM knows the full hierarchy.

Replace the existing `getAllCategories` function with two functions:

```js
/**
 * Get all parent category names.
 * @returns {string[]}
 */
function getAllCategories() {
  return db.prepare('SELECT name FROM categories ORDER BY name').all().map(r => r.name);
}

/**
 * Get all sub-category names.
 * @returns {string[]}
 */
function getAllSubCategories() {
  return db.prepare('SELECT name FROM sub_categories ORDER BY name').all().map(r => r.name);
}

/**
 * Get the full category hierarchy as a formatted string for LLM prompts.
 * Returns lines like: "Groceries: Produce, Dairy, Meat, ..."
 * @returns {string}
 */
function getCategoryHierarchy() {
  const rows = db.prepare(`
    SELECT c.name AS category, GROUP_CONCAT(s.name, ', ') AS subs
    FROM categories c
    LEFT JOIN sub_categories s ON s.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all();
  return rows.map(r => r.subs ? `${r.category}: ${r.subs}` : `${r.category}: (no sub-categories yet)`).join('\n');
}
```

**`insertCategory(name)`** — Rename to `insertSubCategory` and update to also accept a parent `categoryName`. The LLM will now return both `category` (parent) and `sub_category` (detail) for each item.

Replace:
```js
function insertCategory(name) {
  db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name);
}
```

With:
```js
/**
 * Insert a sub-category if it doesn't already exist, linking it to its parent category.
 * Also inserts the parent category if it doesn't exist.
 * @param {string} subCategoryName
 * @param {string} categoryName - The parent category name
 */
function insertSubCategory(subCategoryName, categoryName) {
  // Ensure parent category exists
  db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(categoryName);
  const parent = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
  db.prepare('INSERT OR IGNORE INTO sub_categories (name, category_id) VALUES (?, ?)').run(subCategoryName, parent.id);
}
```

**Update the module.exports** — replace `insertCategory` with `insertSubCategory`, and add `getAllSubCategories` and `getCategoryHierarchy`:

```js
module.exports = {
  insertReceipt, insertLineItem, getAllCategories, getAllSubCategories,
  getCategoryHierarchy, insertSubCategory,
  insertReviewItem, queryLineItems, getUserCount, getUserByUsername, insertUser,
  revokeToken, isTokenRevoked, cleanupExpiredTokens,
};
```

---

### 3. `src/services/validator.js`

**Add `sub_category` as a required field** alongside the existing `category` field. The LLM will now return both.

In `validateOne()`, add validation for `sub_category` (same rules as `category` — non-empty string, max 50 chars).

In `validateLineItems()`, include `sub_category` in the stripped/cleaned valid output object.

The `category` field validation stays the same — it now represents the parent category.

---

### 4. LLM Prompts

All four prompt files need updates.

#### `src/prompts/parse-receipt.md` and `src/prompts/parse-receipt-vision.md`

Both prompts need the same logical changes:

1. **Change the introductory line** from "You are a receipt parser" to "You are a purchase parser". Add: "You may receive OCR text from receipts, utility bills, online order confirmations, or screenshots of any purchase."

2. **Replace the `{{categories}}` placeholder section** with a hierarchy format. Change:
   ```
   ## Current categories in the database

   {{categories}}
   ```
   To:
   ```
   ## Current category hierarchy in the database

   {{category_hierarchy}}
   ```
   The code will now fill `{{category_hierarchy}}` with the output of `getCategoryHierarchy()` (lines like `Groceries: Produce, Dairy, Meat, ...`).

3. **Update rule 3** (category rule) to explain both levels:
   ```
   3. **category**: The broad parent category (e.g. "Groceries", "Utilities", "Transportation"). Use one of the existing parent categories listed above if it fits. Only create a new parent category if NONE of the existing ones are appropriate.
   4. **sub_category**: The specific sub-category within the parent (e.g. "Dairy", "Produce", "Electric"). Use an existing sub-category if one fits. Create a new one if needed.
   ```
   (Renumber subsequent rules accordingly.)

4. **Update the JSON example** to include `sub_category`:
   ```json
   [{"store":"Walmart","product":"Milk","category":"Groceries","sub_category":"Dairy","date":"2025-06-15","cost":4.98,"quantity":1}]
   ```
   For the vision prompt, update both the example items array and the top-level example object.

5. **Add a note about non-receipt inputs:**
   ```
   10. For utility bills: use the utility company as "store", the service type as "product" (e.g. "Electric Service", "Water Service"), and the billing period end date as "date". Use "Utilities" as the category.
   11. For online orders (Amazon, etc.): use the retailer as "store" and extract individual items where possible. Use the order date as "date".
   ```

#### `src/prompts/categorize.md`

Update to show the hierarchy and ask the LLM to return both category and sub-category:

```markdown
# Category Matching Prompt

You are a spending category classifier.

## Category hierarchy

{{category_hierarchy}}

## Task

Given the product name below, choose the most appropriate parent category and sub-category.
Only suggest a new category or sub-category if NONE of the existing ones are a reasonable fit.

**Product:** {{product}}

## Response format

Respond with ONLY a JSON object with two fields. No explanation, no backticks.

{"category": "ParentCategory", "sub_category": "SubCategory"}
```

#### `src/prompts/query-to-sql.md`

Update the schema section to reflect the new table structure:

```sql
TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE          -- broad categories: Groceries, Utilities, etc.
)

TABLE sub_categories (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE,
    category_id INTEGER       -- FK to categories.id
)

TABLE line_items (
    id INTEGER PRIMARY KEY,
    receipt_id INTEGER,
    store TEXT,
    product TEXT,
    category TEXT,            -- this holds the SUB-CATEGORY name (e.g. "Dairy")
    date TEXT,                -- format: YYYY-MM-DD
    cost REAL,
    quantity INTEGER
)

TABLE receipts (
    id INTEGER PRIMARY KEY,
    raw_text TEXT,
    scanned_at DATETIME
)
```

Update the categories placeholder to `{{category_hierarchy}}`.

Add rules:
```
11. To query by broad category (e.g. "how much did I spend on groceries"), JOIN line_items with sub_categories and categories:
    SELECT SUM(li.cost * li.quantity) AS total_spent
    FROM line_items li
    JOIN sub_categories sc ON sc.name = li.category
    JOIN categories c ON c.id = sc.category_id
    WHERE LOWER(c.name) = LOWER('groceries')
12. To query by sub-category, match against line_items.category directly (e.g. WHERE LOWER(category) = LOWER('dairy'))
```

---

### 5. `src/services/parser.js`

**`parseReceipt()`:**
- Change `getAllCategories()` call to `getCategoryHierarchy()` (import it from `../db/queries`).
- Change the template variable from `categories` to `category_hierarchy`.

**`generateSQL()`:**
- Same change: use `getCategoryHierarchy()` and fill `{{category_hierarchy}}`.

---

### 6. `src/services/claude-parser.js`

**`buildVisionPromptText()`:**
- Accept the hierarchy string instead of a categories array.
- Fill `{{category_hierarchy}}` instead of `{{categories}}`.

**`parseReceiptWithVision()`:**
- Call `getCategoryHierarchy()` instead of `getAllCategories()`.
- Pass the hierarchy string to `buildVisionPromptText()`.

**`generateSQL()`:**
- Same change: use `getCategoryHierarchy()` and fill `{{category_hierarchy}}`.

---

### 7. `src/services/parser-router.js`

Update the `parseReceipt()` and `generateSQL()` functions:
- Instead of passing `existingCategories` (an array of strings), pass `categoryHierarchy` (a string from `getCategoryHierarchy()`).
- Update function signatures and calls accordingly in both the router and the underlying parsers.

---

### 8. `src/routes/upload.js`

**In the upload handler:**

- Replace `getAllCategories()` import/call with `getCategoryHierarchy()`.
- Replace `insertCategory(item.category)` with `insertSubCategory(item.sub_category, item.category)`.
  - `item.category` is now the parent category (e.g. "Groceries").
  - `item.sub_category` is the detail (e.g. "Dairy").
- The `insertLineItem()` call stays the same — `line_items.category` stores the sub-category name. So change: `insertLineItem(receiptId, item.store, item.product, item.sub_category, item.date, item.cost, item.quantity)`.

Update the import:
```js
const {
  insertReceipt,
  insertLineItem,
  getCategoryHierarchy,
  insertSubCategory,
  insertReviewItem,
} = require('../db/queries');
```

---

### 9. `CLAUDE.md`

Update the database schema section to reflect the new structure:

```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL  -- broad: Groceries, Utilities, Healthcare, etc.
);

CREATE TABLE sub_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,  -- specific: Produce, Dairy, Electric, etc.
    category_id INTEGER,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

Update the Category Management section to describe the two-level hierarchy.

Update the architecture diagram to mention "purchases" instead of just "receipts" where appropriate.

---

## Summary of Import/Export Changes

| File | Remove | Add |
|---|---|---|
| `src/db/queries.js` | `insertCategory` export | `insertSubCategory`, `getAllSubCategories`, `getCategoryHierarchy` exports |
| `src/routes/upload.js` | `getAllCategories`, `insertCategory` imports | `getCategoryHierarchy`, `insertSubCategory` imports |
| `src/services/parser.js` | `getAllCategories` import | `getCategoryHierarchy` import |
| `src/services/claude-parser.js` | `getAllCategories` import | `getCategoryHierarchy` import |

## Key Principle

The `line_items.category` column continues to store the **sub-category name** (e.g. "Dairy", not "Groceries"). The parent category relationship is resolved through the `sub_categories` table JOIN. This means existing data in `line_items` remains valid with no data migration needed.
