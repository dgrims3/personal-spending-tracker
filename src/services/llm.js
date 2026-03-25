const fs = require('fs');
const path = require('path');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = 'llama3.1:8b';
const LOG_PATH = path.join(__dirname, '../../logs/llm-audit.log');

/**
 * Append an entry to the LLM audit log.
 * @param {object} entry
 */
function auditLog(entry) {
  const logDir = path.dirname(LOG_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(LOG_PATH, line);
}

const TIMEOUT_MS = 120_000;

/**
 * Send a prompt to Ollama and return the response text.
 * Logs every request and response to the audit log.
 * @param {string} prompt
 * @returns {Promise<string>} Raw response text
 */
async function generate(prompt) {
  const body = {
    model: MODEL,
    prompt,
    stream: false,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let rawResponse = null;
  let error = null;

  try {
    let res;
    try {
      res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${TIMEOUT_MS / 1000}s`);
      }
      if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
        throw new Error(`Ollama is not running at ${OLLAMA_URL}`);
      }
      throw err;
    }

    if (!res.ok) {
      throw new Error(`Ollama returned HTTP ${res.status}`);
    }

    const data = await res.json();
    rawResponse = data.response;
    return rawResponse;
  } catch (err) {
    error = err.message;
    throw err;
  } finally {
    clearTimeout(timer);
    auditLog({ prompt, rawResponse, error });
  }
}

module.exports = { generate, auditLog };
