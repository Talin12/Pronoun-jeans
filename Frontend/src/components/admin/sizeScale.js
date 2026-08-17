/**
 * Size-range logic for building set breakdowns.
 *
 * Kept free of JSX/React so it can be reasoned about — and tested — on its own.
 * SizeRangeBuilder is the UI over it.
 */

// The lettered scale, smallest to largest. Matches the historic SIZE_CHOICES:
// XXL then 3XL (not XXXL), so a generated range reads the way existing sets do.
export const LETTER_SCALE = [
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL',
];

// Spellings buyers and staff actually type, mapped onto the scale above.
const LETTER_ALIASES = {
  '2XL': 'XXL', 'XXXL': '3XL', 'XXXXL': '4XL', 'XXXXXL': '5XL',
  'SMALL': 'S', 'MEDIUM': 'M', 'LARGE': 'L',
};

// A runaway range ("1" to "100000") would otherwise render forever.
export const MAX_SIZES = 40;

export const normalizeLetter = (raw) => {
  const s = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
  const mapped = LETTER_ALIASES[s] || s;
  return LETTER_SCALE.includes(mapped) ? mapped : null;
};

const isNumericSize = (raw) => /^\d{1,3}$/.test(String(raw ?? '').trim());

/** 'numeric' | 'letter' | null — null means we can't read one or both ends. */
export function detectScale(from, to) {
  if (isNumericSize(from) && isNumericSize(to)) return 'numeric';
  if (normalizeLetter(from) && normalizeLetter(to)) return 'letter';
  return null;
}

/**
 * Every size from one end to the other, inclusive and ascending. Ends given in
 * either order both work — the smaller one always comes first.
 */
export function expandRange(from, to, step = 2) {
  const scale = detectScale(from, to);
  if (!scale) return [];

  if (scale === 'numeric') {
    const a = Number(String(from).trim());
    const b = Number(String(to).trim());
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const by = Math.max(1, Number(step) || 1);
    const out = [];
    for (let n = lo; n <= hi && out.length < MAX_SIZES; n += by) out.push(String(n));
    // Always include the top of the range, even when the step overshoots it
    // (30 to 37 by 2 would otherwise stop at 36 and silently drop 37).
    if (out.length && out.length < MAX_SIZES && out[out.length - 1] !== String(hi)) {
      out.push(String(hi));
    }
    return out;
  }

  const ai = LETTER_SCALE.indexOf(normalizeLetter(from));
  const bi = LETTER_SCALE.indexOf(normalizeLetter(to));
  const [lo, hi] = ai <= bi ? [ai, bi] : [bi, ai];
  return LETTER_SCALE.slice(lo, hi + 1).slice(0, MAX_SIZES);
}

/** "2x30, 1x32" — the stored breakdown form. Order follows the size order. */
export const toBreakdownString = (sizes) =>
  sizes.filter(s => Number(s.qty) > 0).map(s => `${Number(s.qty)}x${s.size}`).join(', ');

/** Articles (garment pieces) in one set. */
export const countPieces = (sizes) =>
  sizes.filter(s => Number(s.qty) > 0).reduce((sum, s) => sum + Number(s.qty), 0);

/** "30 TO 36" / "L TO 3XL" — the naming convention already in use. */
export function suggestName(from, to) {
  const scale = detectScale(from, to);
  if (!scale) return '';
  if (scale === 'numeric') {
    const a = Number(from), b = Number(to);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return lo === hi ? String(lo) : `${lo} TO ${hi}`;
  }
  const a = normalizeLetter(from), b = normalizeLetter(to);
  const ai = LETTER_SCALE.indexOf(a), bi = LETTER_SCALE.indexOf(b);
  const [lo, hi] = ai <= bi ? [a, b] : [b, a];
  return lo === hi ? lo : `${lo} TO ${hi}`;
}

/** Default numeric step: this catalogue sizes jeans 28, 30, 32… */
export function defaultStep(from, to) {
  const a = Number(from), b = Number(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 2;
  return a % 2 === 0 && b % 2 === 0 ? 2 : 1;
}
