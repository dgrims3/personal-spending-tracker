const fs = require('fs');
const path = require('path');
const { generate } = require('./llm');
const { auditLog } = require('./logger');
const { validateLineItems } = require('./validator');
const { assertSafeSQL } = require('./sql-safety');
const { getCategoryHierarchy } = require('../db/queries');

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
 * @param {string} [categoryHierarchy] - Category hierarchy string; fetched from DB if omitted
 * @returns {Promise<{ items: object[], needsReview: boolean, reviewReason: string|null }>}
 */
async function parseReceipt(rawText, categoryHierarchy) {
  const hierarchy = categoryHierarchy ?? getCategoryHierarchy();
  const template = loadPrompt('parse-receipt');
  const prompt = fillTemplate(template, {
    category_hierarchy: hierarchy || '(none yet)',
    raw_text: rawText,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    let rawResponse;
    let parsed;
    let parseError = null;
    let validationResult = null;

    try {
      rawResponse = await generate(prompt);
    } catch (err) {
      auditLog({ stage: 'parse-receipt', attempt, error: err.message, validationPassed: false });
      throw err;
    }

    try {
      const cleaned = rawResponse.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/,'');
      parsed = JSON.parse(cleaned);
    } catch (err) {
      parseError = `JSON parse error: ${err.message}`;
    }

    if (!parseError) {
      validationResult = validateLineItems(Array.isArray(parsed) ? parsed : parsed?.items ?? parsed);
    }

    const validationPassed = !parseError && validationResult.invalid.length === 0;

    auditLog({
      stage: 'parse-receipt',
      attempt,
      parsedResult: parseError ? null : parsed,
      parseError,
      invalidItems: validationResult?.invalid ?? null,
      validationPassed,
    });

    if (validationPassed) {
      return { items: validationResult.valid, needsReview: false, reviewReason: null };
    }

    if (attempt === 2) {
      const reason = parseError
        ?? validationResult.invalid.map((e) => e.reason).join('; ');
      return { items: validationResult.valid, needsReview: true, reviewReason: reason };
    }
  }
}

/**
 * Convert a natural language question to a SQL SELECT query.
 * Throws if the generated query is not a safe SELECT statement.
 * @param {string} question
 * @param {string} [categoryHierarchy] - Category hierarchy string; fetched from DB if omitted
 * @returns {Promise<string>} SQL query string
 */
async function generateSQL(question, categoryHierarchy) {
  const hierarchy = categoryHierarchy ?? getCategoryHierarchy();
  const template = loadPrompt('query-to-sql');
  const prompt = fillTemplate(template, {
    category_hierarchy: hierarchy || '(none yet)',
    question,
  });

  const rawResponse = await generate(prompt);
  const sql = rawResponse.trim();

  auditLog({
    stage: 'query-to-sql',
    question,
    rawResponse,
    sql,
  });

  assertSafeSQL(sql);
  return sql;
}

module.exports = { parseReceipt, generateSQL };
