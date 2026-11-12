/**
 * Input validation utilities
 */

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

export function isValidPhone(phone) {
  if (!phone) return true; // Phone is often optional
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10;
}

export function isValidAmount(amount) {
  const num = Number(amount);
  return !isNaN(num) && num > 0 && isFinite(num);
}

export function sanitizeText(text) {
  if (!text) return '';
  return String(text).trim().replace(/[<>]/g, '');
}

