const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a single line item object.
 * @param {object} item
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateOne(item) {
  const errors = [];

  if (typeof item !== 'object' || item === null) {
    return { ok: false, errors: ['Item is not an object'] };
  }

  if (typeof item.store !== 'string' || !item.store.trim()) {
    errors.push('store must be a non-empty string');
  }
  if (typeof item.product !== 'string' || !item.product.trim()) {
    errors.push('product must be a non-empty string');
  }
  if (typeof item.category !== 'string' || !item.category.trim()) {
    errors.push('category must be a non-empty string');
  }
  if (typeof item.date !== 'string' || !DATE_RE.test(item.date)) {
    errors.push('date must match YYYY-MM-DD');
  }
  if (typeof item.cost !== 'number' || item.cost <= 0) {
    errors.push('cost must be a number greater than 0');
  }

  const qty = item.quantity ?? 1;
  if (!Number.isInteger(qty) || qty < 1) {
    errors.push('quantity must be a positive integer');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate an array of parsed line item objects.
 * Each item must have: store (string), product (string), category (string),
 * date (YYYY-MM-DD string), cost (number > 0), quantity (positive integer).
 * Strips unexpected fields from valid items. Defaults quantity to 1 if absent.
 *
 * @param {object[]} items - Array of parsed line item objects
 * @returns {{ valid: object[], invalid: Array<{ item: object, reason: string }> }}
 */
function validateLineItems(items) {
  if (!Array.isArray(items)) {
    return {
      valid: [],
      invalid: [{ item: items, reason: 'Expected an array of line items' }],
    };
  }

  const valid = [];
  const invalid = [];

  for (const item of items) {
    const result = validateOne(item);
    if (result.ok) {
      valid.push({
        store: item.store.trim(),
        product: item.product.trim(),
        category: item.category.trim(),
        date: item.date,
        cost: item.cost,
        quantity: item.quantity ?? 1,
      });
    } else {
      invalid.push({ item, reason: result.errors.join('; ') });
    }
  }

  return { valid, invalid };
}

module.exports = { validateLineItems };
