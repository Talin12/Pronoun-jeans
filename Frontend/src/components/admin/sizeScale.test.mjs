import assert from 'node:assert/strict';
import {
  countPieces, defaultStep, detectScale, expandRange, normalizeLetter,
  suggestName, toBreakdownString,
} from './sizeScale.js';

let pass = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log(`ok   ${name}`); }
  catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
};

// ── scale detection ───────────────────────────────────────────────────────────
t('numeric range detected', () => assert.equal(detectScale('30', '36'), 'numeric'));
t('letter range detected', () => assert.equal(detectScale('L', '3XL'), 'letter'));
t('lowercase letters detected', () => assert.equal(detectScale('l', 'xxl'), 'letter'));
t('mixed scales rejected', () => assert.equal(detectScale('30', 'XL'), null));
t('nonsense rejected', () => assert.equal(detectScale('abc', 'def'), null));
t('empty rejected', () => assert.equal(detectScale('', ''), null));

// ── aliases ───────────────────────────────────────────────────────────────────
t('2XL is canonical', () => assert.equal(normalizeLetter('2XL'), '2XL'));
t('legacy XXL maps to 2XL', () => assert.equal(normalizeLetter('XXL'), '2XL'));
t('XXXL is 3XL', () => assert.equal(normalizeLetter('XXXL'), '3XL'));
t('spaces and dashes ignored', () => assert.equal(normalizeLetter(' x-x-l '), '2XL'));

// ── numeric expansion ─────────────────────────────────────────────────────────
t('30-36 by 2', () =>
  assert.deepEqual(expandRange('30', '36', 2), ['30', '32', '34', '36']));
t('30-36 by 1', () =>
  assert.deepEqual(expandRange('30', '36', 1), ['30', '31', '32', '33', '34', '35', '36']));
t('reversed ends still ascend', () =>
  assert.deepEqual(expandRange('36', '30', 2), ['30', '32', '34', '36']));
t('single size range', () =>
  assert.deepEqual(expandRange('32', '32', 2), ['32']));
t('step overshoot keeps the top end', () =>
  assert.deepEqual(expandRange('30', '37', 2), ['30', '32', '34', '36', '37']));
t('runaway range is capped', () =>
  assert.equal(expandRange('1', '999', 1).length, 40));

// ── letter expansion ──────────────────────────────────────────────────────────
t('L to 3XL matches the historic set', () =>
  assert.deepEqual(expandRange('L', '3XL'), ['L', 'XL', '2XL', '3XL']));
t('S to 2XL', () =>
  assert.deepEqual(expandRange('S', '2XL'), ['S', 'M', 'L', 'XL', '2XL']));
t('legacy XXL as a range end still expands', () =>
  assert.deepEqual(expandRange('L', 'XXL'), ['L', 'XL', '2XL']));
t('reversed letters still ascend', () =>
  assert.deepEqual(expandRange('3XL', 'L'), ['L', 'XL', '2XL', '3XL']));

// ── breakdown string + article count ──────────────────────────────────────────
const sizes = [{ size: 'L', qty: 1 }, { size: 'XL', qty: 2 }, { size: '2XL', qty: 1 }];
t('breakdown string matches the stored format', () =>
  assert.equal(toBreakdownString(sizes), '1xL, 2xXL, 1x2XL'));
t('article count sums quantities', () =>
  assert.equal(countPieces(sizes), 4));
t('zero-qty sizes are excluded from both', () => {
  const withZero = [...sizes, { size: '3XL', qty: 0 }];
  assert.equal(toBreakdownString(withZero), '1xL, 2xXL, 1x2XL');
  assert.equal(countPieces(withZero), 4);
});
t('numeric breakdown reads correctly', () =>
  assert.equal(toBreakdownString([{ size: '30', qty: 2 }, { size: '32', qty: 1 }]), '2x30, 1x32'));

// ── naming ────────────────────────────────────────────────────────────────────
t('numeric name', () => assert.equal(suggestName('30', '36'), '30 TO 36'));
t('letter name', () => assert.equal(suggestName('L', '3XL'), 'L TO 3XL'));
t('legacy XXL normalised in the name', () => assert.equal(suggestName('L', 'XXL'), 'L TO 2XL'));
t('reversed ends named low-to-high', () => assert.equal(suggestName('36', '30'), '30 TO 36'));
t('single size names itself', () => assert.equal(suggestName('32', '32'), '32'));
t('unreadable range has no name', () => assert.equal(suggestName('30', 'XL'), ''));

// ── default step ──────────────────────────────────────────────────────────────
t('even ends step by 2', () => assert.equal(defaultStep('30', '36'), 2));
t('odd end steps by 1', () => assert.equal(defaultStep('30', '37'), 1));

console.log(`\n${pass} passed`);
