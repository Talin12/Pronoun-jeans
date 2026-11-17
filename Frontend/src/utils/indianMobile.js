// Indian mobile numbers as people actually type them into a form.
//
// Buyers in this trade type "+91 98765 43210", "098765 43210", "91-98765-43210"
// and "9876543210" interchangeably. All four mean the same number, so they are
// reduced to the ten digits the rest of the codebase stores — the same shape
// BUSINESS.phone keeps, for the same reason.

/**
 * Ten digits, or whatever is left if the input was not a mobile number at all.
 * Spaces, hyphens, brackets, dots and a leading +91 / 91 / 0 are removed.
 */
export function normaliseIndianMobile(value) {
  const digits = String(value ?? '').trim().replace(/^\+/, '').replace(/[\s()./-]/g, '');
  if (/^91\d{10}$/.test(digits)) return digits.slice(2);
  if (/^0\d{10}$/.test(digits)) return digits.slice(1);
  return digits;
}

/** Indian mobile ranges start 6–9; landlines and short codes do not. */
export const isIndianMobile = (value) => /^[6-9]\d{9}$/.test(normaliseIndianMobile(value));

export const MOBILE_FORMAT_ERROR =
  'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.';
export const MOBILE_REQUIRED_ERROR =
  'Enter a mobile number so our team can call you back.';

/** '' when acceptable, otherwise the message to show under the field. */
export function mobileFieldError(value, { required }) {
  const entered = String(value ?? '').trim();
  if (!entered) return required ? MOBILE_REQUIRED_ERROR : '';
  return isIndianMobile(entered) ? '' : MOBILE_FORMAT_ERROR;
}
