'use strict';

const express = require('express');
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { extractText } = require('../services/ocr');
const { parseReceipt } = require('../services/parser-router');
const { auditLog } = require('../services/logger');
const {
  insertReceipt,
  insertLineItem,
  getCategoryHierarchy,
  insertSubCategory,
  insertReviewItem,
} = require('../db/queries');

const router = express.Router();

// Magic byte signatures for allowed image types.
// Checked against the actual file bytes — not the client-supplied Content-Type.
const IMAGE_SIGNATURES = [
  { type: 'image/jpeg', offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  { type: 'image/png',  offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { type: 'image/gif',  offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8 (covers GIF87a and GIF89a)
  { type: 'image/webp', offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], // RIFF header
    secondaryOffset: 8, secondaryBytes: [0x57, 0x45, 0x42, 0x50] },  // WEBP marker at byte 8
];

/**
 * Read the first 12 bytes of a file and match against known image magic numbers.
 * Returns the detected MIME type, or null if the file is not a recognised image.
 * @param {string} filePath
 * @returns {string|null}
 */
function detectImageMagic(filePath) {
  const header = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, header, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }

  for (const sig of IMAGE_SIGNATURES) {
    const primary = sig.bytes.every((b, i) => header[sig.offset + i] === b);
    if (!primary) continue;
    if (sig.secondaryBytes) {
      const secondary = sig.secondaryBytes.every((b, i) => header[sig.secondaryOffset + i] === b);
      if (!secondary) continue;
    }
    return sig.type;
  }
  return null;
}

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

    // Verify the file's actual bytes match a known image format.
    // The multer fileFilter only checked the client-supplied Content-Type header,
    // which is trivially spoofed.
    const detectedType = detectImageMagic(filePath);
    if (!detectedType) {
      return res.status(400).json({ error: 'File does not appear to be a valid image' });
    }

    const mode = process.env.RECEIPT_PARSER_MODE || 'local';
    let imageBuffer = null;
    let rawText;
    let receiptId;
    let parseResult;
    const categoryHierarchy = getCategoryHierarchy();

    if (mode === 'claude') {
      // Claude vision: read image into buffer, skip Tesseract entirely.
      // Parse first so we can store Claude's extracted raw text in the receipts table.
      imageBuffer = fs.readFileSync(filePath);
      auditLog({
        stage: 'upload',
        step: 'vision-start',
        mimeType: req.file.mimetype,
        imageSizeBytes: imageBuffer.length,
      });
      parseResult = await parseReceipt(imageBuffer, req.file.mimetype, null, categoryHierarchy);
      rawText = parseResult.rawText
        ?? `Parsed via Claude Vision (${req.file.mimetype}, ${imageBuffer.length} bytes)`;
      receiptId = insertReceipt(rawText);
    } else {
      // Local: run Tesseract OCR to get the raw receipt text, then parse with Ollama.
      rawText = await extractText(filePath);
      if (!rawText) {
        return res.status(422).json({ error: 'Could not extract text from image' });
      }
      auditLog({ stage: 'upload', step: 'ocr-complete', textLength: rawText.length });
      receiptId = insertReceipt(rawText);
      parseResult = await parseReceipt(null, req.file.mimetype, rawText, categoryHierarchy);
    }

    const { items, needsReview, reviewReason } = parseResult;

    // If ALL items failed after retry, queue the whole receipt for manual review.
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

    let itemsInserted = 0;
    let itemsFailed = 0;

    for (const item of items) {
      try {
        insertSubCategory(item.sub_category, item.category);
        insertLineItem(receiptId, item.store, item.product, item.sub_category, item.date, item.cost, item.quantity);
        itemsInserted++;
      } catch (err) {
        auditLog({ stage: 'upload', step: 'insert-failed', receiptId, item, error: err.message });
        itemsFailed++;
      }
    }

    // Some items were valid but others failed — queue for partial review.
    if (needsReview) {
      insertReviewItem(receiptId, rawText, reviewReason);
      auditLog({ stage: 'upload', step: 'partial-review', receiptId, reason: reviewReason });
    }

    auditLog({ stage: 'upload', step: 'complete', receiptId, itemsInserted, itemsFailed });

    res.json({ receiptId, itemsInserted, itemsFailed, items });
  } catch (err) {
    auditLog({ stage: 'upload', step: 'error', error: err.message });
    console.error('Upload error:', err);
    res.status(500).json({ error: 'An internal error occurred. Please try again.' });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

module.exports = router;
