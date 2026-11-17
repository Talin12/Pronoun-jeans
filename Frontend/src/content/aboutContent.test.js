// Both /about variants must stay renderable, because the switch between them
// is meant to be a one-line change in assumptions.js made by whoever gets the
// client's answer — not a code change, and not a debugging session.
//
// Run with `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ABOUT_VARIANTS, aboutContent, aboutAddressLines } from './aboutContent.js';
import { BUSINESS, mark } from './seoContent.js';
import { ASSUMPTIONS } from './assumptions.js';

const NAMES = Object.keys(ABOUT_VARIANTS);

test('the ledger names a variant that exists', () => {
  assert.ok(NAMES.includes(ASSUMPTIONS.aboutVariant), `unknown aboutVariant: ${ASSUMPTIONS.aboutVariant}`);
  assert.equal(aboutContent(), ABOUT_VARIANTS[ASSUMPTIONS.aboutVariant]);
});

test('an unknown variant falls back rather than rendering nothing', () => {
  assert.equal(aboutContent('no-such-variant'), ABOUT_VARIANTS['who-we-are']);
});

for (const name of NAMES) {
  test(`variant ${name} parses and gives exactly one h1`, () => {
    const page = ABOUT_VARIANTS[name];

    // One h1: a single non-empty string, which both renderers emit once.
    assert.equal(typeof page.h1, 'string');
    assert.ok(page.h1.trim().length > 0);
    assert.equal(typeof page.tagline, 'string');
    assert.ok(page.tagline.trim().length > 0);

    assert.ok(Array.isArray(page.sections) && page.sections.length > 0);
    const ids = new Set();
    for (const section of page.sections) {
      assert.ok(section.heading.trim().length > 0, 'every section needs a heading');
      assert.match(section.id, /^[a-z0-9-]+$/, `section id is not an anchor: ${section.id}`);
      assert.ok(!ids.has(section.id), `duplicate section id: ${section.id}`);
      ids.add(section.id);

      // A section carries paragraphs or cards, never both — the renderers
      // branch on exactly that.
      assert.ok(
        Array.isArray(section.paragraphs) !== Array.isArray(section.cards),
        `section ${section.id} must have either paragraphs or cards`,
      );
      for (const para of section.paragraphs ?? []) {
        assert.equal(typeof para, 'string');
        assert.ok(para.trim().length > 0, `empty paragraph in ${section.id}`);
      }
      for (const card of section.cards ?? []) {
        assert.ok(card.title.trim().length > 0);
        assert.ok(card.body.trim().length > 0);
      }
    }

    assert.ok(page.closing.line.trim().length > 0);
    assert.equal(typeof page.closing.showAddress, 'boolean');
  });
}

test('the default variant carries the full text the client supplied', () => {
  const page = ABOUT_VARIANTS['who-we-are'];
  assert.equal(page.h1, 'About Us');
  // Every section has copy — this is the one that renders today.
  for (const section of page.sections) {
    const filled = (section.paragraphs ?? section.cards ?? []).length;
    assert.ok(filled > 0, `section ${section.id} has no copy`);
  }
  // The size sets and waist range come from the ledger, not from a literal.
  const ordering = page.sections.find((s) => s.id === 'wholesale-ordering');
  for (const set of ASSUMPTIONS.sizeSets) {
    assert.ok(ordering.paragraphs[0].includes(set), `missing size set ${set}`);
  }
  assert.ok(ordering.paragraphs[0].includes(ASSUMPTIONS.waistRange));
});

test('the trademark symbol in the About copy answers to the ledger flag', () => {
  const page = ABOUT_VARIANTS['who-we-are'];
  const wrong = ASSUMPTIONS.trademarkRegistered ? '™' : '®';
  const all = JSON.stringify(page);
  assert.ok(all.includes(mark(BUSINESS.brand)));
  assert.ok(!all.includes(wrong), `the About copy hardcodes a ${wrong}`);
});

test('the address under the closing line comes from BUSINESS', () => {
  assert.deepEqual(aboutAddressLines(), [BUSINESS.displayName, ...BUSINESS.addressLines]);
});
