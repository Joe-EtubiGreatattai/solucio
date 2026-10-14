// Shared helpers for the Bank statements library and review pages.

export const confidenceLabel = (confidence) => {
  if (confidence === 'needs-review') return 'Needs review';
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`;
};

export function categoryLabel(transaction) {
  if (transaction.direction === 'income') return 'Income';
  return [transaction.type, transaction.group, transaction.item].filter(Boolean).join(' › ') || 'Uncategorized';
}

// Whether a row will be imported when the statement is approved. Missing/undefined means yes.
export const isIncluded = (transaction) => transaction.included !== false;

// Rows still needing a decision — excluded rows never block approval and never count as review.
export const unresolvedCount = (statement) =>
  (statement?.transactions || []).filter(isIncluded).filter((entry) => entry.confidence === 'needs-review').length;
