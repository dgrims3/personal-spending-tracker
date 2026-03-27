'use strict';

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { auditLog } = require('./logger');
const { validateLineItems } = require('./validator');
const { generateSQL: generateSQLLocal } = require('./parser');
const { getAllCategories } = require('../db/queries');

const PROMPTS_DIR = path.join(__dirname, '../prompts');

/**
 * Return an Anthropic client, throwing if ANTHROPIC_API_KEY is not set.
 * @returns {Anthropic}
 */
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Required when RECEIPT_PARSER_MODE=claude.');
  }
  return new Anthropic({ apiKey });
}

/**
 * Load a prompt template from src/prompts/.
 * @param {string} name - Filename without extension
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
 * Build the vision prompt text from parse-receipt-vision.md.
 * @param {string[]} categories
 * @returns {string}
 */
function buildVisionPromptText(categories) {
  const template = loadPrompt('parse-receipt-vision');
  return fillTemplate(template, {
    categories: categories.length ? categories.join(', ') : '(none yet)',
  }).trim();
}

/**
 * Format an Anthropic SDK error into a readable message.
 * @param {unknown} err
 * @returns {string}
 */
function formatApiError(err) {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 429) {
      return `Claude API rate limit exceeded — try again in a moment. (${err.message})`;
    }
    if (err.status === 401) {
      return `Claude API authentication failed — check ANTHROPIC_API_KEY. (${err.message})`;
    }
    return `Claude API error ${err.status}: ${err.message}`;
  }
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return `Network error reaching Claude API: ${err.message}`;
  }
  return err.message || String(err);
}

/**
 * Parse a receipt image using Claude's vision API.
 * Uses the rules from src/prompts/parse-receipt.md, adapted for vision input.
 * Retries once on parse/validation failure; marks needsReview on second failure.
 *
 * @param {Buffer} imageBuffer - Raw image bytes
 * @param {string} mimeType - MIME type (e.g. 'image/jpeg', 'image/png')
 * @param {string[]} [existingCategories] - Category names; fetched from DB if omitted
 * @returns {Promise<{ items: object[], needsReview: boolean, reviewReason: string|null }>}
 */
async function parseReceiptWithVision(imageBuffer, mimeType, existingCategories) {
  const client = getClient();
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  const categories = existingCategories ?? getAllCategories();
  const promptText = buildVisionPromptText(categories);
  const imageBase64 = imageBuffer.toString('base64');

  for (let attempt = 1; attempt <= 2; attempt++) {
    let rawResponse = null;
    let parsed = null;
    let parseError = null;
    let validationResult = null;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: imageBase64 },
              },
              { type: 'text', text: promptText },
            ],
          },
        ],
      });
      rawResponse = response.content[0].text;
    } catch (err) {
      const errMessage = formatApiError(err);
      auditLog({
        stage: 'parse-receipt-vision',
        attempt,
        model,
        mimeType,
        imageSizeBytes: imageBuffer.length,
        prompt: promptText,
        rawResponse: null,
        error: errMessage,
        validationPassed: false,
      });
      throw new Error(errMessage);
    }

    try {
      const cleaned = rawResponse
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/, '');
      parsed = JSON.parse(cleaned);
    } catch (err) {
      parseError = `JSON parse error: ${err.message}`;
    }

    // Response is { raw_text: "...", items: [...] }; fall back to plain array for safety.
    const extractedRawText = parsed?.raw_text ?? null;
    const itemsArray = Array.isArray(parsed) ? parsed : parsed?.items ?? parsed;

    if (!parseError) {
      validationResult = validateLineItems(itemsArray);
    }

    const validationPassed = !parseError && validationResult.invalid.length === 0;

    auditLog({
      stage: 'parse-receipt-vision',
      attempt,
      model,
      mimeType,
      imageSizeBytes: imageBuffer.length,
      prompt: promptText,
      rawResponse,
      extractedRawText,
      parsedResult: parseError ? null : parsed,
      parseError,
      invalidItems: validationResult?.invalid ?? null,
      validationPassed,
    });

    if (validationPassed) {
      return { items: validationResult.valid, needsReview: false, reviewReason: null, rawText: extractedRawText };
    }

    if (attempt === 2) {
      const reason =
        parseError ?? validationResult.invalid.map((e) => e.reason).join('; ');
      return {
        items: validationResult?.valid ?? [],
        needsReview: true,
        reviewReason: reason,
        rawText: extractedRawText,
      };
    }
  }
}

const SELECT_RE = /^\s*SELECT\b/i;
const WRITE_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE)\b/i;

/**
 * Convert a natural language question to a SQL SELECT query.
 * Uses Claude text API when RECEIPT_PARSER_MODE=claude and ANTHROPIC_API_KEY is set;
 * otherwise delegates to the local Ollama-based generator.
 *
 * @param {string} question
 * @param {string[]} [existingCategories] - Category names; fetched from DB if omitted
 * @returns {Promise<string>} SQL SELECT query string
 */
async function generateSQL(question, existingCategories) {
  const useClaude =
    process.env.RECEIPT_PARSER_MODE === 'claude' && !!process.env.ANTHROPIC_API_KEY;

  if (!useClaude) {
    return generateSQLLocal(question, existingCategories);
  }

  const client = getClient();
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  const categories = existingCategories ?? getAllCategories();
  const template = loadPrompt('query-to-sql');
  const prompt = fillTemplate(template, {
    categories: categories.length ? categories.join(', ') : '(none yet)',
    question,
  });

  let rawResponse = null;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    rawResponse = response.content[0].text;
  } catch (err) {
    const errMessage = formatApiError(err);
    auditLog({
      stage: 'query-to-sql-claude',
      model,
      question,
      prompt,
      rawResponse: null,
      error: errMessage,
    });
    throw new Error(errMessage);
  }

  const sql = rawResponse.trim();

  auditLog({
    stage: 'query-to-sql-claude',
    model,
    question,
    prompt,
    rawResponse,
    sql,
  });

  if (!SELECT_RE.test(sql) || WRITE_RE.test(sql)) {
    throw new Error('LLM returned a non-SELECT query');
  }

  return sql;
}

module.exports = { parseReceiptWithVision, generateSQL };
