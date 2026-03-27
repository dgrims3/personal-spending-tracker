# Receipt Tracker

A self-hosted personal finance tool for scanning receipts and querying spending. Photograph a receipt with your phone, and the app extracts and categorizes every line item using AI — either the Anthropic Claude API (fast, accurate, ~$0.01–0.02 per receipt) or a fully local stack with Ollama and Tesseract (free, no internet required, but slower). All data is stored in a local SQLite database, and you can ask questions about your spending in plain English: "How much did I spend on groceries last month?"

---

## Prerequisites

### Common

- **Node.js 18+**
- **SQLite3** (usually pre-installed on Linux/macOS; on Debian/Ubuntu: `sudo apt install sqlite3`)

### Option A — Claude API (recommended)

- An **Anthropic API key** from [console.anthropic.com](https://console.anthropic.com)
- No other AI software required

### Option B — Local / Ollama (free)

- **Ollama** running locally with a model pulled (e.g. `ollama pull llama3.1`)
  - Install: [ollama.com](https://ollama.com)
  - Default URL assumed: `http://localhost:11434`
- **Tesseract OCR** for extracting text from receipt images
  - Debian/Ubuntu: `sudo apt install tesseract-ocr`
  - macOS: `brew install tesseract`

---

## Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd receipt-tracker

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and fill in values (see Configuration below)

# 4. Create the database
node src/db/init.js

# 5. Start the server
node server.js
```

Open `http://localhost:3000` in your browser. You will be prompted to create an account on first visit.

---

## Configuration

All configuration is via environment variables in `.env`.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DB_PATH` | `./data/receipts.db` | Path to the SQLite database file |
| `JWT_SECRET` | — | Secret used to sign login tokens. **Change this before deploying.** Generate one with `openssl rand -hex 32` |
| `RECEIPT_PARSER_MODE` | `local` | Parsing backend: `claude` or `local` |
| `ANTHROPIC_API_KEY` | — | Your Anthropic API key. Required when `RECEIPT_PARSER_MODE=claude` |
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514` | Claude model used for receipt parsing and queries |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL. Used when `RECEIPT_PARSER_MODE=local` |
| `OLLAMA_MODEL` | `llama3.1` | Ollama model name. Must be pulled before use (`ollama pull <model>`) |

---

## Switching between Claude and local modes

**To use Claude:**

```env
RECEIPT_PARSER_MODE=claude
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514
```

In Claude mode, receipt images are sent directly to the Claude vision API — Tesseract is not used and does not need to be installed.

**To use local Ollama:**

```env
RECEIPT_PARSER_MODE=local
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

In local mode, Tesseract OCR extracts text from the image first, then Ollama interprets the text and extracts line items. Both services must be running before you start the server.

The active mode is shown on the main page of the app.

---

## Claude API costs

Receipt parsing uses Claude's vision API (one API call per upload) and the messages API for natural language queries (one call per query).

| Operation | Approximate cost |
|---|---|
| Scan a receipt | $0.01–0.02 |
| Ask a spending query | < $0.01 |

Costs vary with receipt length and the model chosen. At typical personal-finance volumes (a few receipts per day), monthly API costs are well under $5.

---

## License

MIT
