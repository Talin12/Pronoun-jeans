// The guard that stops the Terms and the Refund Policy from contradicting
// each other again.
//
// They arrived disagreeing on six points — what qualifies for an exchange, the
// evidence required, the damaged-goods deadline, whether refunds exist, the
// condition carve-out and the same-design rule. Both now read the claim
// window, the eligible cases, the evidence and the refund stance from
// EXCHANGE_POLICY, and these assert that the rendered pages really do agree.
// The next prose edit that reintroduces a literal fails here.
//
// Run with `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  legalPages, LEGAL_SLUGS, EXCHANGE_POLICY, contactValue, legalLastUpdatedLabel,
} from './legalContent.js';
import { BUSINESS, formatPhone } from './seoContent.js';
import { ASSUMPTIONS } from './assumptions.js';

const SITE = 'https://www.pronounjeans.com';
const PAGES = legalPages(SITE);

/** Every rendered string on a page: intro, headings, bodies, lists, closing. */
function allText(page) {
  const out = [...page.intro, page.title, page.lastUpdated, ...page.closing];
  const walk = (node) => {
    for (const p of node.body ?? []) out.push(typeof p === 'string' ? p : p.text);
    for (const i of node.list ?? []) out.push(i);
    for (const p of node.after ?? []) out.push(typeof p === 'string' ? p : p.text);
    for (const row of node.contactRows ?? []) {
      const v = row.key ? contactValue(row.key, SITE) : { text: row.text };
      out.push(row.label, v.text);
    }
    for (const sub of node.subsections ?? []) { out.push(sub.heading); walk(sub); }
  };
  for (const s of page.sections) { out.push(s.heading); walk(s); }
  return out;
}

const textOf = (slug) => allText(PAGES[slug]).join('\n');

test('all four legal pages are built', () => {
  assert.deepEqual(Object.keys(PAGES).sort(), [...LEGAL_SLUGS].sort());
  for (const slug of LEGAL_SLUGS) {
    const page = PAGES[slug];
    assert.equal(page.slug, slug);
    assert.ok(page.title.trim());
    assert.ok(page.sections.length > 0);
    assert.ok(page.description.length <= 155, `${slug} description is ${page.description.length} chars`);
  }
});

// ── 1. The same claim window on both pages ─────────────────────────────────

test('Terms and Refund Policy state the same claim window', () => {
  const window = `${EXCHANGE_POLICY.windowDays} ${EXCHANGE_POLICY.windowUnit}`;
  const terms = textOf('terms');
  const refund = textOf('refund-policy');
  assert.ok(terms.includes(window), 'Terms does not state the claim window');
  assert.ok(refund.includes(window), 'Refund Policy does not state the claim window');
  assert.ok(terms.includes(`from ${EXCHANGE_POLICY.windowFrom}`));
  assert.ok(refund.includes(`from ${EXCHANGE_POLICY.windowFrom}`));
  // And neither says a different number of days anywhere.
  for (const [name, text] of [['Terms', terms], ['Refund', refund]]) {
    const others = text.match(/within \d+ (calendar|working|business) days?/g) ?? [];
    for (const phrase of others) {
      assert.ok(
        phrase.includes(window) || phrase.includes('7 working days'),
        `${name} states an unexpected deadline: "${phrase}"`,
      );
    }
  }
});

// ── 2. The same eligible cases ─────────────────────────────────────────────

test('Terms and Refund Policy list the same eligible cases', () => {
  for (const slug of ['terms', 'refund-policy']) {
    const text = textOf(slug).toLowerCase();
    for (const kase of EXCHANGE_POLICY.eligibleCases) {
      assert.ok(text.includes(kase.toLowerCase()), `${slug} does not name "${kase}"`);
    }
  }
  // The draft Terms covered wrong goods ONLY. That is the contradiction this
  // asserts is gone: damaged goods must be named in the Terms too.
  assert.ok(textOf('terms').toLowerCase().includes('damaged goods'));
});

// ── 3. The same evidence requirement ───────────────────────────────────────

test('Terms and Refund Policy require the same evidence', () => {
  assert.equal(ASSUMPTIONS.exchangeEvidence, 'buyer-unboxing');
  assert.ok(textOf('terms').includes(EXCHANGE_POLICY.evidence));
  // The Refund Policy's own wording, which is the authoritative version.
  assert.ok(/parcel opening \(unboxing\) video is compulsory/.test(textOf('refund-policy')));
  // The draft Terms asked only for "clear photographs" — that must not be the
  // stated requirement any more.
  assert.ok(
    !/must provide .*clear photographs of the goods received/.test(textOf('terms')),
    'the Terms still state photographs as the evidence requirement',
  );
});

test('both state the same refund stance', () => {
  for (const slug of ['terms', 'refund-policy']) {
    assert.ok(textOf(slug).includes(EXCHANGE_POLICY.refundStance), `${slug} omits the refund stance`);
  }
});

// ── 4. One phone, email and address across all four pages ──────────────────

test('every phone, email and address on the legal pages is the BUSINESS value', () => {
  const phone = formatPhone(BUSINESS.phone);
  const address = BUSINESS.addressLines.join(', ');
  for (const slug of LEGAL_SLUGS) {
    const text = textOf(slug);

    for (const found of text.match(/\+91[\s-]?\d[\d\s-]{8,}/g) ?? []) {
      assert.equal(found.trim(), phone, `${slug} shows the phone as "${found.trim()}"`);
    }
    for (const found of text.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []) {
      assert.equal(found, BUSINESS.email, `${slug} shows the email as "${found}"`);
    }
    for (const found of text.match(/C-129[^\n]*/g) ?? []) {
      assert.equal(found, address, `${slug} shows the address as "${found}"`);
    }
    // The drafts' address carried a landmark the ledger deliberately dropped
    // for NAP consistency (A7). It must not come back in one document only.
    assert.ok(!text.includes('Anupam Cinema'), `${slug} reintroduces the dropped landmark`);
  }
});

// ── 5. No business fact typed as a literal in the source ───────────────────

test('legalContent.js hardcodes no business fact and no trademark symbol', () => {
  const file = readFileSync(fileURLToPath(new URL('./legalContent.js', import.meta.url)), 'utf8');
  // Whole-line comments and block comments are stripped first: the file's
  // header explains which draft date was NOT used and that the ® goes through
  // mark(), and documenting that is the opposite of hardcoding it. Trailing
  // comments are left in, so they are held to the same standard as code.
  const source = file
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  for (const literal of ['9375', '10:00 AM', '6:30', '17 November 2026']) {
    assert.ok(!source.includes(literal), `legalContent.js contains the literal "${literal}"`);
  }
  // mark() decides the symbol; a bare one in the source would ignore the flag.
  assert.ok(!source.includes('®'), 'legalContent.js contains a hardcoded ®');
  assert.ok(!source.includes('™'), 'legalContent.js contains a hardcoded ™');
  // And the rendered pages carry the symbol the flag selects.
  const wrong = ASSUMPTIONS.trademarkRegistered ? '™' : '®';
  for (const slug of LEGAL_SLUGS) {
    assert.ok(!textOf(slug).includes(wrong), `${slug} renders the wrong trademark symbol`);
  }
});

// ── 6. A real, non-future publication date ─────────────────────────────────

test('legalLastUpdated is a valid ISO date, not in the future', () => {
  const iso = ASSUMPTIONS.legalLastUpdated;
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/, 'not an ISO date');
  const date = new Date(`${iso}T00:00:00Z`);
  assert.ok(!Number.isNaN(date.getTime()), 'not a real date');
  assert.equal(date.toISOString().slice(0, 10), iso, 'not a date that exists');
  // Compared against the LOCAL calendar date, not UTC: the business publishes
  // from Ahmedabad, and on an IST evening "today" is already tomorrow in UTC,
  // which would fail a correct date for five and a half hours every day.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const localToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  assert.ok(iso <= localToday, `legalLastUpdated ${iso} is after today (${localToday})`);
  // All four pages print it, through the one helper.
  for (const slug of LEGAL_SLUGS) {
    assert.equal(PAGES[slug].lastUpdated, legalLastUpdatedLabel());
  }
});

// ── Structure the renderers depend on ──────────────────────────────────────

test('section ids are unique anchors within each page', () => {
  for (const slug of LEGAL_SLUGS) {
    const ids = new Set();
    for (const s of PAGES[slug].sections) {
      assert.match(s.id, /^[a-z0-9-]+$/, `${slug}: bad anchor ${s.id}`);
      assert.ok(!ids.has(s.id), `${slug}: duplicate anchor ${s.id}`);
      ids.add(s.id);
      for (const sub of s.subsections ?? []) {
        assert.ok(!ids.has(sub.id), `${slug}: duplicate anchor ${sub.id}`);
        ids.add(sub.id);
      }
    }
  }
});

test('the shipping policy carries the same clauses as Terms section 7', () => {
  const inTerms = PAGES.terms.sections.find((s) => s.id === 'shipping-and-delivery');
  const standalone = PAGES['shipping-policy'].sections.find((s) => s.id === 'shipping-and-delivery');
  assert.deepEqual(standalone.list, inTerms.list);
});

test('order cancellation lives in the refund policy, with a pointer in the terms', () => {
  const refund = PAGES['refund-policy'].sections.find((s) => s.id === 'order-cancellation');
  assert.ok(refund.list.length === 4, 'the cancellation clause did not move across in full');
  assert.ok(refund.list[0].startsWith('Buyers should request cancellation before dispatch'));

  const terms = PAGES.terms.sections.find((s) => s.id === 'order-cancellation');
  assert.equal(terms.body.length, 1, 'the Terms should carry a one-line pointer only');
  assert.equal(terms.body[0].href, '/refund-policy');
});

test('the terms product list comes from the ledger, not the draft', () => {
  const clause = PAGES.terms.sections.find((s) => s.id === 'about-our-business').body[0];
  for (const category of ASSUMPTIONS.legalProductCategories) {
    assert.ok(clause.includes(category), `the Terms omit "${category}"`);
  }
  // The draft named two things the business does not sell.
  assert.ok(!clause.includes('capris'), 'the Terms still list capris');
  assert.ok(!clause.includes('lounge wear'), 'the Terms still list lounge wear');
});
