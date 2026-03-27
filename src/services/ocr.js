const { execFileSync } = require('child_process');

const TESSERACT_TIMEOUT_MS = 60_000;

/**
 * Run Tesseract OCR on an image file.
 * Uses execFileSync (no shell) to prevent command injection via the file path.
 * @param {string} imagePath - Absolute path to the image file
 * @returns {Promise<string>} Extracted text
 */
async function extractText(imagePath) {
  try {
    const output = execFileSync('tesseract', [imagePath, 'stdout'], {
      encoding: 'utf8',
      timeout: TESSERACT_TIMEOUT_MS,
    });
    return output.trim();
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('Tesseract not found. Install it with: apt-get install tesseract-ocr');
    }
    if (err.signal === 'SIGTERM') {
      throw new Error(`Tesseract timed out after ${TESSERACT_TIMEOUT_MS / 1000}s`);
    }
    const stderr = err.stderr || '';
    if (stderr.includes('Error') || stderr.includes('Failed') || err.status !== 0) {
      throw new Error(`Tesseract failed to process image: ${stderr.trim() || err.message}`);
    }
    throw err;
  }
}

module.exports = { extractText };
