# Receipt Tracker

A personal receipt scanning and spending tracker. Take a photo of a receipt, AI extracts and categorizes the items, stores them in SQLite, and lets you query your spending in natural language.

## Architecture

```
Phone camera (browser) → Upload image
                              ↓
                    Express backend (Node.js)
                              ↓
                    Tesseract OCR (image → raw text)
                              ↓
                    Ollama / Llama 3.1 8B (local LLM)
                      - Interprets raw text
                      - Builds structured line items
                      - Matches to existing categories
                              ↓
                    Validation layer (check JSON, types, required fields)
                              ↓
                    SQLite database

Natural language query → Ollama → SQL generation → SQLite → Results → Frontend
```

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** Plain HTML/CSS/JS (no framework)
- **Database:** SQLite (file: `./data/receipts.db`)
- **OCR:** Tesseract (`tesseract` CLI, installed at system level)
- **AI:** Ollama running Llama 3.1 8B at `http://localhost:11434`
- **Auth:** Simple token-based auth (bcrypt password hash, JWT sessions)

## Server Environment

- **Host:** Debian server, Intel i7-3770, 16GB RAM
- **IP:** 192.168.68.67
- **User:** david
- **Other services running:** Jellyfin (Docker, port 8096), AdGuard Home (Docker, port 8080/53), Ollama (systemd, port 11434)
- **App port:** 3000

## Database Schema

```sql
CREATE TABLE receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_text TEXT NOT NULL,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL,
    store TEXT NOT NULL,
    product TEXT NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,  -- ISO 8601: YYYY-MM-DD
    cost REAL NOT NULL,
    quantity INTEGER DEFAULT 1,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id)
);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);
```

The `categories` table is the source of truth. Before the LLM creates a new category, the app must query all existing categories and pass them to the LLM prompt so it picks an existing one when appropriate.

## Project Structure

```
receipt-tracker/
├── CLAUDE.md              # This file (project context for Claude Code)
├── package.json
├── server.js              # Express entry point
├── data/
│   └── receipts.db        # SQLite database (created on first run)
├── src/
│   ├── routes/
│   │   ├── auth.js        # Login/logout endpoints
│   │   ├── upload.js       # Receipt upload + processing pipeline
│   │   └── query.js        # Natural language query endpoint
│   ├── services/
│   │   ├── ocr.js          # Tesseract wrapper
│   │   ├── llm.js          # Ollama API client
│   │   ├── parser.js       # LLM prompt builder + response parser
│   │   └── validator.js    # JSON schema validation before DB insert
│   ├── db/
│   │   ├── init.js         # Create tables if not exist
│   │   └── queries.js      # Parameterized SQL helpers
│   └── prompts/
│       ├── parse-receipt.md    # Prompt template for receipt parsing
│       ├── categorize.md       # Prompt template for category matching
│       └── query-to-sql.md     # Prompt template for NL-to-SQL
├── public/
│   ├── index.html          # Auth page
│   ├── app.html            # Main page (upload / query toggle)
│   ├── results.html        # Query results display
│   ├── style.css
│   └── app.js
├── logs/
│   └── llm-audit.log      # Every LLM request/response logged here
└── test/
    └── ...                 # Tests
```

## Key Design Rules

### LLM Output Validation
NEVER insert LLM output directly into the database. Always:
1. Parse the LLM response as JSON
2. Validate required fields exist: store, product, category, date, cost
3. Validate types: cost is a number > 0, date matches YYYY-MM-DD, quantity is a positive integer
4. If validation fails, log the failure and retry the prompt once. If it fails again, save to a "review queue" for manual inspection.

### LLM Audit Trail
Every call to Ollama must be logged to `logs/llm-audit.log` with:
- Timestamp
- Prompt sent
- Raw response received
- Parsed result (or parse error)
- Whether validation passed/failed

### Category Management
Before asking the LLM to categorize items:
1. Query all existing categories from the `categories` table
2. Include the full category list in the prompt
3. The LLM should use an existing category if one fits
4. Only create a new category if nothing existing is appropriate
5. New categories are inserted into the `categories` table

### Prompt Files
All LLM prompts live in `src/prompts/` as markdown files. The app loads them at runtime. This allows prompt iteration without code changes. Prompts use `{{variable}}` placeholders that get replaced at runtime.

## Commands

```bash
# Install dependencies
npm install

# Initialize the database (creates tables if not exist)
node src/db/init.js

# Start the server
node server.js

# Run tests
npm test
```

## Coding Conventions

- Use `const` and `let`, never `var`
- Use async/await, not callbacks or raw promises
- Use `better-sqlite3` npm package for SQLite (synchronous API, simpler than async alternatives)
- Error handling: try/catch with meaningful error messages
- No TypeScript — plain JavaScript with JSDoc comments for documentation
- Keep functions small and single-purpose
- Use environment variables for configuration (port, db path, ollama URL) with sensible defaults
