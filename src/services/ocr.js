const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Run Tesseract OCR on an image file.
 * @param {string} imagePath - Absolute path to the image file
 * @returns {Promise<string>} Extracted text
 */
async function extractText(imagePath) {
  const outBase = path.join(os.tmpdir(), `ocr-${Date.now()}`);
  const outFile = `${outBase}.txt`;

  try {
    await execFileAsync('tesseract', [imagePath, outBase]);
    const text = fs.readFileSync(outFile, 'utf8');
    return text.trim();
  } finally {
    if (fs.existsSync(outFile)) {
      fs.unlinkSync(outFile);
    }
  }
}

module.exports = { extractText };
