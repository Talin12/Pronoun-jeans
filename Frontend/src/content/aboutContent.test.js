// Both /about variants must stay renderable, because the switch between them
// is meant to be a one-line change in assumptions.js made by whoever gets the
// client's answer — not a code change, and not a debugging session.
//
// Run with `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABOUT_VARIANTS, aboutContent, aboutAddressLines, aboutHighlights,
} from './aboutContent.js';
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

    for (const para of page.intro ?? []) {
      assert.equal(typeof para, 'string');
      assert.ok(para.trim().length > 0, 'empty intro paragraph');
    }

    assert.ok(Array.isArray(page.closing.lines) && page.closing.lines.length > 0);
    for (const line of page.closing.lines) assert.ok(line.trim().length > 0);
    assert.equal(typeof page.closing.showAddress, 'boolean');
  });

  test(`variant ${name} carries the full text the client supplied`, () => {
    // Both variants are complete now, so neither may ship an empty section.
    for (const section of ABOUT_VARIANTS[name].sections) {
      const filled = (section.paragraphs ?? section.cards ?? []).length;
      assert.ok(filled > 0, `${name}: section ${section.id} has no copy`);
    }
  });
}

test('the default variant reads the size sets from the ledger', () => {
  const page = ABOUT_VARIANTS['who-we-are'];
  assert.equal(page.h1, 'About Us');
  // The size sets and waist range come from the ledger, not from a literal.
  const ordering = page.sections.find((s) => s.id === 'wholesale-ordering');
  for (const set of ASSUMPTIONS.sizeSets) {
    assert.ok(ordering.paragraphs[0].includes(set), `missing size set ${set}`);
  }
  assert.ok(ordering.paragraphs[0].includes(ASSUMPTIONS.waistRange));
});

test('the trademark symbol in the About copy answers to the ledger flag', () => {
  const wrong = ASSUMPTIONS.trademarkRegistered ? '™' : '®';
  for (const name of NAMES) {
    const all = JSON.stringify(ABOUT_VARIANTS[name]);
    assert.ok(all.includes(mark(BUSINESS.brand)), `${name} never names the brand with its mark`);
    assert.ok(!all.includes(wrong), `${name} hardcodes a ${wrong}`);
  }
});

test('both variants carry the same "What We Stand For" cards', () => {
  const cardsOf = (name) => ABOUT_VARIANTS[name].sections
    .find((s) => s.id === 'what-we-stand-for')?.cards;
  const first = cardsOf(NAMES[0]);
  assert.ok(first && first.length === 3, 'the values cards are missing');
  for (const name of NAMES) {
    const cards = cardsOf(name);
    assert.ok(cards, `${name} has no "What We Stand For" section`);
    // Defined once and shared, so the wording cannot diverge between them.
    assert.deepEqual(cards, first, `${name} states the values differently`);
    for (const card of cards) {
      assert.match(card.id, /^[a-z0-9-]+$/, `card id is not usable as a key: ${card.id}`);
      assert.ok(card.title.trim() && card.body.trim());
    }
  }
});

test('the buyer-facing highlights come from the ledger, not from copy', () => {
  const highlights = aboutHighlights();
  assert.ok(highlights.length >= 3);
  for (const h of highlights) {
    assert.ok(h.label.trim() && h.value.trim(), 'an empty highlight');
    assert.ok(h.icon, `${h.label} has no icon key`);
  }
  const byLabel = Object.fromEntries(highlights.map((h) => [h.label, h.value]));
  assert.equal(byLabel['Size sets'], ASSUMPTIONS.sizeSets.join(' · '));
  assert.equal(byLabel['Waist sizes'], ASSUMPTIONS.waistRange);
  assert.ok(byLabel.Dispatch.includes(BUSINESS.locality));
});

test('the address under the closing line comes from BUSINESS', () => {
  assert.deepEqual(aboutAddressLines(), [BUSINESS.displayName, ...BUSINESS.addressLines]);
});
