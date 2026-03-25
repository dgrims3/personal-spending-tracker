const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a single line item from LLM output.
 * @param {object} item
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateLineItem(item) {
  const errors = [];

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['item is not an object'] };
  }

  if (!item.store || typeof item.store !== 'string') errors.push('store is required and must be a string');
  if (!item.product || typeof item.product !== 'string') errors.push('product is required and must be a string');
  if (!item.category || typeof item.category !== 'string') errors.push('category is required and must be a string');
  if (!item.date || typeof item.date !== 'string' || !DATE_RE.test(item.date)) errors.push('date is required and must be YYYY-MM-DD');
  if (typeof item.cost !== 'number' || item.cost <= 0) errors.push('cost must be a number greater than 0');

  const quantity = item.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) errors.push('quantity must be a positive integer');

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an array of line items.
 * @param {object[]} items
 * @returns {{ valid: boolean, items: object[], errors: string[] }}
 */
function validateLineItems(items) {
  if (!Array.isArray(items)) {
    return { valid: false, items: [], errors: ['response is not an array'] };
  }

  const allErrors = [];
  const validItems = [];

  items.forEach((item, i) => {
    const { valid, errors } = validateLineItem(item);
    if (valid) {
      validItems.push({ ...item, quantity: item.quantity ?? 1 });
    } else {
      allErrors.push(`item[${i}]: ${errors.join('; ')}`);
    }
  });

  return { valid: allErrors.length === 0, items: validItems, errors: allErrors };
}

module.exports = { validateLineItem, validateLineItems };
