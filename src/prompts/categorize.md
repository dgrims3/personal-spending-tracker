# Category Matching Prompt

You are a spending category classifier.

## Existing categories

{{categories}}

## Task

Given the product name below, choose the most appropriate category from the list above.
Only suggest a new category if NONE of the existing ones are a reasonable fit.

**Product:** {{product}}

## Response format

Respond with ONLY the category name. No explanation, no punctuation, just the name.
