const http = require('http');
const { auditLog } = require('./logger');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

const TIMEOUT_MS = 600_000;

/**
 * Send a prompt to Ollama and return the response text.
 * Uses http.request with no socket/headers timeout — only our own timer.
 * @param {string} prompt
 * @returns {Promise<string>} Raw response text
 */
async function generate(prompt) {
  const body = JSON.stringify({
    model: MODEL,
    prompt,
    stream: false,
  });

  const url = new URL('/api/generate', OLLAMA_URL);

  let rawResponse = null;
  let error = null;
  let abortTimer = null;

  try {
    rawResponse = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 0,
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString();
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`Ollama returned HTTP ${res.statusCode}`));
              return;
            }
            try {
              const data = JSON.parse(raw);
              resolve(data.response);
            } catch (err) {
              reject(new Error(`Failed to parse Ollama response: ${err.message}`));
            }
          });
          res.on('error', reject);
        },
      );

      req.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          reject(new Error(`Ollama is not running at ${OLLAMA_URL}`));
        } else {
          reject(err);
        }
      });

      abortTimer = setTimeout(() => {
        req.destroy(new Error(`Ollama request timed out after ${TIMEOUT_MS / 1000}s`));
      }, TIMEOUT_MS);

      req.write(body);
      req.end();
    });

    return rawResponse;
  } catch (err) {
    error = err.message;
    throw err;
  } finally {
    clearTimeout(abortTimer);
    auditLog({ prompt, rawResponse, error });
  }
}

module.exports = { generate };
