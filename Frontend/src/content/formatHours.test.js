// The guard that stops the displayed opening hours and the JSON-LD from
// drifting apart again.
//
// Before this, /contact printed "Mon – Sat: 10:00 AM – 6:30 PM" from a typed
// string while three separate openingHoursSpecification blocks carried
// 10:00/18:30 — four copies of the same fact, none of them derived from
// another. The label is now computed from opensAt/closesAt, and these assert
// that the computed label and the schema really do say the same thing.
//
// Run with `npm test` (node --test, no test framework — no new dependencies).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUSINESS, formatHours, to12Hour, openDayNames,
  formatPhone, telHref, waHref, phoneE164,
} from './seoContent.js';
import { openingHours, localBusinessSchema } from './schemaBuilders.js';
import { ASSUMPTIONS } from './assumptions.js';

test('to12Hour converts 24-hour times the way the page prints them', () => {
  assert.equal(to12Hour('11:00'), '11:00 AM');
  assert.equal(to12Hour('20:00'), '8:00 PM');
  assert.equal(to12Hour('00:00'), '12:00 AM');
  assert.equal(to12Hour('12:00'), '12:00 PM');
  assert.equal(to12Hour('09:30'), '9:30 AM');
  assert.equal(to12Hour('18:30'), '6:30 PM');
});

test('formatHours builds the label from the 24-hour values', () => {
  assert.equal(
    formatHours({ openDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], opensAt: '11:00', closesAt: '20:00' }),
    'Mon – Sat: 11:00 AM – 8:00 PM',
  );
  // A single open day must not render as a range.
  assert.equal(formatHours({ openDays: ['Mo'], opensAt: '11:00', closesAt: '20:00' }), 'Mon: 11:00 AM – 8:00 PM');
});

test('the label shown on the page is derived, not typed', () => {
  assert.equal(BUSINESS.hoursLabel, formatHours(BUSINESS));
  assert.ok(BUSINESS.hoursLabel.includes(to12Hour(BUSINESS.opensAt)));
  assert.ok(BUSINESS.hoursLabel.includes(to12Hour(BUSINESS.closesAt)));
});

test('the visible hours and the openingHoursSpecification agree', () => {
  const [spec] = openingHours();
  assert.equal(spec.opens, BUSINESS.opensAt);
  assert.equal(spec.closes, BUSINESS.closesAt);
  assert.deepEqual(spec.dayOfWeek, openDayNames(BUSINESS.openDays));
  assert.equal(spec.dayOfWeek.length, BUSINESS.openDays.length);
  // And the same spec is what the LocalBusiness node publishes.
  assert.deepEqual(localBusinessSchema('https://example.test').openingHoursSpecification, openingHours());
});

test('every rendering of the phone number comes from the same digits', () => {
  const d = BUSINESS.phone;
  assert.equal(d, ASSUMPTIONS.phone, 'the phone must come from the assumptions ledger');
  assert.match(d, /^[6-9]\d{9}$/, 'stored as ten digits, with no prefix or spacing');
  assert.equal(formatPhone(d), '+91 93751 43100');
  assert.equal(telHref(d), `tel:+91${d}`);
  assert.equal(phoneE164(d), `+91${d}`);
  assert.ok(waHref(d, 'hi').startsWith(`https://wa.me/91${d}?text=`));
  // The schema publishes the same number the page links to.
  assert.equal(localBusinessSchema('https://example.test').telephone, phoneE164(d));
  // An empty number must produce no link at all rather than "tel:+91".
  assert.equal(telHref(''), '');
  assert.equal(formatPhone(''), '');
  assert.equal(waHref('', 'hi'), '');
});

test('the street address in the schema is the address the page prints', () => {
  assert.deepEqual(BUSINESS.addressLines, ASSUMPTIONS.addressLines);
  assert.equal(BUSINESS.streetAddress, ASSUMPTIONS.addressLines.slice(0, -1).join(', '));
  assert.equal(localBusinessSchema('https://example.test').address.streetAddress, BUSINESS.streetAddress);
});

test('the trademark symbol answers to one flag', () => {
  const expected = ASSUMPTIONS.trademarkRegistered ? '®' : '™';
  assert.ok(BUSINESS.displayName.includes(expected));
  assert.ok(!BUSINESS.displayName.includes(ASSUMPTIONS.trademarkRegistered ? '™' : '®'));
});
