const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { extractText } = require('../services/ocr');
const { parseReceipt } = require('../services/parser');
const { insertReceipt, insertLineItem, upsertCategory, insertReviewItem } = require('../db/queries');

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
 * Returns parsed line items or review status.
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

    // Step 2: Store raw receipt
    const receiptId = insertReceipt(rawText);

    // Step 3: Parse with LLM
    const { items, needsReview, reviewReason } = await parseReceipt(rawText);

    if (needsReview) {
      insertReviewItem(receiptId, rawText, reviewReason);
      return res.status(202).json({
        status: 'review',
        message: 'Receipt queued for manual review',
        reason: reviewReason,
      });
    }

    // Step 4: Store validated items
    for (const item of items) {
      upsertCategory(item.category);
      insertLineItem(receiptId, item);
    }

    res.json({ status: 'ok', receiptId, items });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

module.exports = router;
