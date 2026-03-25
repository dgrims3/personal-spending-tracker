const express = require('express');
const { authenticate } = require('../middleware/auth');
const { questionToSql } = require('../services/parser');
const { runSelectQuery } = require('../db/queries');

const router = express.Router();

// Simple safeguard: only allow SELECT statements
const SELECT_RE = /^\s*SELECT\b/i;
const WRITE_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE)\b/i;

/**
 * POST /api/query
 * Body: { question: string }
 * Returns: { sql: string, results: object[] }
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' });
    }

    const sql = await questionToSql(question);

    if (!SELECT_RE.test(sql) || WRITE_RE.test(sql)) {
      return res.status(422).json({ error: 'Generated query is not a safe SELECT statement', sql });
    }

    const results = runSelectQuery(sql);
    res.json({ sql, results });
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
