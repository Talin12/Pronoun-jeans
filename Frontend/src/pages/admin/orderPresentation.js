/**
 * Shared presentation for orders — the list and the detail page must agree on
 * what "Approved" looks like, or the same order appears to change colour when
 * you open it.
 */

export const STATUS_TONES = {
  PENDING_VERIFICATION: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  PENDING:              'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-zinc-400',
  APPROVED:             'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
  SHIPPED:              'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  DELIVERED:            'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400',
  CANCELLED:            'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

export const PAYMENT_TONES = {
  pending: 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-zinc-400',
  paid:    'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400',
  partial: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  failed:  'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

/** Order.Status.choices, in the sequence an order actually moves through. */
export const ORDER_STATUSES = [
  ['PENDING_VERIFICATION', 'Pending Verification'],
  ['PENDING',              'Pending'],
  ['APPROVED',             'Approved'],
  ['SHIPPED',              'Shipped'],
  ['DELIVERED',            'Delivered'],
  ['CANCELLED',            'Cancelled'],
];

export const PAYMENT_STATUSES = [
  ['pending', 'Pending'],
  ['paid',    'Paid'],
  ['partial', 'Partial'],
  ['failed',  'Failed'],
];

/**
 * Rupees, the way the rest of the panel writes them. Amounts arrive from DRF as
 * decimal strings — kept as strings all the way to here so nothing rounds a
 * price through a float on the way.
 */
export const money = (value) => {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};
