const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { extractText } = require('../services/ocr');
const { parseReceipt } = require('../services/parser');
const { auditLog } = require('../services/logger');
const {
  insertReceipt,
  insertLineItem,
  getAllCategories,
  insertCategory,
  insertReviewItem,
} = require('../db/queries');

const router = express.Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

/**
 * POST /api/upload
 * Multipart form: field name "receipt" containing the image file.
 * Returns { receiptId, itemsInserted, itemsFailed, items }.
 */
router.post('/', authenticate, upload.single('receipt'), async (req, res) => {
  const filePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Step 1: OCR
    const rawText = await extractText(filePath);
    if (!rawText) {
      return res.status(422).json({ error: 'Could not extract text from image' });
    }

    auditLog({ stage: 'upload', step: 'ocr-complete', textLength: rawText.length });

    // Step 2: Store raw receipt
    const receiptId = insertReceipt(rawText);

    // Step 3: Get existing categories
    const existingCategories = getAllCategories();

    // Step 4: Parse with LLM (retries once internally on full validation failure)
    const { items, needsReview, reviewReason } = await parseReceipt(rawText, existingCategories);

    // Step 5: If ALL items failed after retry, queue for review
    if (items.length === 0 && needsReview) {
      insertReviewItem(receiptId, rawText, reviewReason);
      auditLog({ stage: 'upload', step: 'all-items-failed', receiptId, reason: reviewReason });
      return res.status(422).json({
        receiptId,
        itemsInserted: 0,
        itemsFailed: 0,
        items: [],
        reviewQueued: true,
        reviewReason,
      });
    }

    // Step 6: Insert valid items and their categories
    let itemsInserted = 0;
    let itemsFailed = 0;

    for (const item of items) {
      try {
        insertCategory(item.category);
        insertLineItem(receiptId, item.store, item.product, item.category, item.date, item.cost, item.quantity);
        itemsInserted++;
      } catch (err) {
        auditLog({ stage: 'upload', step: 'insert-failed', receiptId, item, error: err.message });
        itemsFailed++;
      }
    }

    // If some items needed review, queue those
    if (needsReview) {
      insertReviewItem(receiptId, rawText, reviewReason);
      auditLog({ stage: 'upload', step: 'partial-review', receiptId, reason: reviewReason });
    }

    auditLog({
      stage: 'upload',
      step: 'complete',
      receiptId,
      itemsInserted,
      itemsFailed,
    });

    res.json({ receiptId, itemsInserted, itemsFailed, items });
  } catch (err) {
    auditLog({ stage: 'upload', step: 'error', error: err.message });
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

module.exports = router;
