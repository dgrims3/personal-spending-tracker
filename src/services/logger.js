const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '../../logs/llm-audit.log');

/**
 * Append a structured entry to the LLM audit log (JSONL format).
 * Creates the logs/ directory if it does not exist.
 *
 * Each line is a JSON object with at minimum a `timestamp` field.
 * Callers should include: prompt, rawResponse, parsedResult, validationPassed.
 *
 * @param {object} entry - Fields to log
 */
function auditLog(entry) {
  const logDir = path.dirname(LOG_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(LOG_PATH, line);
}

module.exports = { auditLog };
