const fs = require('fs');
const path = require('path');
const { complete, auditLog } = require('./llm');
const { validateLineItems } = require('./validator');
const { getCategories } = require('../db/queries');

const PROMPTS_DIR = path.join(__dirname, '../prompts');

/**
 * Load a prompt template from src/prompts/.
 * @param {string} name - Filename without extension (e.g. 'parse-receipt')
 * @returns {string}
 */
function loadPrompt(name) {
  return fs.readFileSync(path.join(PROMPTS_DIR, `${name}.md`), 'utf8');
}

/**
 * Replace {{variable}} placeholders in a prompt template.
 * @param {string} template
 * @param {Record<string, string>} vars
 * @returns {string}
 */
function fillTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Parse raw OCR text into structured line items using the LLM.
 * Retries once on validation failure; queues for review if still invalid.
 * @param {string} rawText
 * @returns {Promise<{ items: object[], needsReview: boolean, reviewReason: string|null }>}
 */
async function parseReceipt(rawText) {
  const categories = getCategories();
  const template = loadPrompt('parse-receipt');
  const prompt = fillTemplate(template, {
    categories: categories.length ? categories.join(', ') : '(none yet)',
    raw_text: rawText,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    let rawResponse;
    let parsed;
    let parseError = null;
    let validationResult = null;

    try {
      rawResponse = await complete(prompt);
    } catch (err) {
      auditLog({ stage: 'parse-receipt', attempt, error: err.message, validationPassed: false });
      throw err;
    }

    try {
      parsed = JSON.parse(rawResponse);
    } catch (err) {
      parseError = `JSON parse error: ${err.message}`;
    }

    if (!parseError) {
      validationResult = validateLineItems(parsed);
    }

    const validationPassed = !parseError && validationResult.valid;

    auditLog({
      stage: 'parse-receipt',
      attempt,
      parsedResult: parseError ? null : parsed,
      parseError,
      validationErrors: validationResult?.errors ?? null,
      validationPassed,
    });

    if (validationPassed) {
      return { items: validationResult.items, needsReview: false, reviewReason: null };
    }

    if (attempt === 2) {
      const reason = parseError ?? validationResult.errors.join('; ');
      return { items: [], needsReview: true, reviewReason: reason };
    }
  }
}

/**
 * Convert a natural language question to a SQL SELECT query.
 * @param {string} question
 * @returns {Promise<string>} SQL query string
 */
async function questionToSql(question) {
  const categories = getCategories();
  const template = loadPrompt('query-to-sql');
  const prompt = fillTemplate(template, {
    categories: categories.length ? categories.join(', ') : '(none yet)',
    question,
  });

  const rawResponse = await complete(prompt);

  auditLog({
    stage: 'query-to-sql',
    question,
    rawResponse,
  });

  return rawResponse.trim();
}

module.exports = { parseReceipt, questionToSql };
