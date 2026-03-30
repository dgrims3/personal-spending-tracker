'use strict';

const { auditLog } = require('./logger');
const { parseReceipt: parseReceiptLocal, generateSQL: generateSQLLocal } = require('./parser');
const { parseReceiptWithVision, generateSQL: generateSQLClaude } = require('./claude-parser');

const MODE = process.env.RECEIPT_PARSER_MODE || 'local';

/**
 * Parse a receipt using the configured RECEIPT_PARSER_MODE.
 *
 * claude mode: passes imageBuffer + mimeType to Claude vision. rawText is ignored.
 * local mode:  passes rawText to the Ollama-based parser. imageBuffer is ignored.
 *
 * @param {Buffer|null} imageBuffer - Raw image bytes (required in claude mode)
 * @param {string} mimeType - MIME type of the image (e.g. 'image/jpeg')
 * @param {string} rawText - OCR output or placeholder (required in local mode)
 * @param {string} [categoryHierarchy] - Category hierarchy string; fetched from DB if omitted
 * @returns {Promise<{ items: object[], needsReview: boolean, reviewReason: string|null }>}
 */
async function parseReceipt(imageBuffer, mimeType, rawText, categoryHierarchy) {
  auditLog({ stage: 'parser-router', mode: MODE, fn: 'parseReceipt' });

  if (MODE === 'claude') {
    return parseReceiptWithVision(imageBuffer, mimeType, categoryHierarchy);
  }
  return parseReceiptLocal(rawText, categoryHierarchy);
}

/**
 * Convert a natural language question to a SQL SELECT query using the
 * configured RECEIPT_PARSER_MODE.
 *
 * @param {string} question
 * @param {string} [categoryHierarchy] - Category hierarchy string; fetched from DB if omitted
 * @returns {Promise<string>} SQL SELECT query string
 */
async function generateSQL(question, categoryHierarchy) {
  auditLog({ stage: 'parser-router', mode: MODE, fn: 'generateSQL' });

  if (MODE === 'claude') {
    return generateSQLClaude(question, categoryHierarchy);
  }
  return generateSQLLocal(question, categoryHierarchy);
}

module.exports = { parseReceipt, generateSQL };
