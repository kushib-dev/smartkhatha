/**
 * Currency utility for Indian Rupee formatting (₹)
 */

export function formatINR(amount, includeDecimals = false) {
  const numericAmount = Number(amount) || 0;
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

export function parseINRInput(value) {
  if (typeof value === 'number') return Math.max(0, value);
  if (!value) return 0;
  // Remove currency symbols, commas, whitespace
  const clean = String(value).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

