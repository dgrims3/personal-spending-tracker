const { execSync } = require('child_process');

/**
 * Run Tesseract OCR on an image file.
 * @param {string} imagePath - Absolute path to the image file
 * @returns {Promise<string>} Extracted text
 */
async function extractText(imagePath) {
  try {
    const output = execSync(`tesseract ${JSON.stringify(imagePath)} stdout`, {
      encoding: 'utf8',
    });
    return output.trim();
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('Tesseract not found. Install it with: apt-get install tesseract-ocr');
    }
    const stderr = err.stderr || '';
    if (stderr.includes('Error') || stderr.includes('Failed') || err.status !== 0) {
      throw new Error(`Tesseract failed to process image: ${stderr.trim() || err.message}`);
    }
    throw err;
  }
}

module.exports = { extractText };
