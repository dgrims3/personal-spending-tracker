const express = require('express');
const { authenticate } = require('../middleware/auth');
const { generateSQL } = require('../services/parser');
const { auditLog } = require('../services/logger');
const { getAllCategories, queryLineItems } = require('../db/queries');

const router = express.Router();

/**
 * POST /api/query
 * JSON body: { question: "how much did I spend on groceries this month?" }
 * Returns: { question, sql, results: [...] }
 */
router.post('/', authenticate, async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'A "question" field is required' });
  }

  try {
    const categories = getAllCategories();
    const sql = await generateSQL(question, categories);

    let results;
    try {
      results = queryLineItems(sql);
    } catch (err) {
      auditLog({
        stage: 'query',
        step: 'sql-execution-error',
        question,
        sql,
        error: err.message,
      });
      return res.status(422).json({ error: 'Generated SQL failed to execute', question, sql });
    }

    auditLog({
      stage: 'query',
      step: 'complete',
      question,
      sql,
      resultCount: results.length,
    });

    res.json({ question, sql, results });
  } catch (err) {
    auditLog({ stage: 'query', step: 'error', question, error: err.message });
    console.error('Query error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
