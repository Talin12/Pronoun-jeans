/**
 * DECISIONS TAKEN WITHOUT CLIENT CONFIRMATION — 18 Nov 2026.
 * Each entry says what was assumed and what to change if the client disagrees.
 * Nothing in this file may be duplicated as a literal anywhere else in the codebase.
 */
export const ASSUMPTIONS = {
  // A1 — PHONE. Legal drafts say 9375043100; the live site says 9375143100.
  // Assumed the LIVE site is correct: it has been in production, in schema.org markup,
  // behind the tel: link and the WhatsApp button, and nobody reported missed calls.
  // If the client says the drafts are right -> change this one string.
  phone: '9375143100',
  whatsapp: '9375143100',

  // A2 — EXCHANGE EVIDENCE. Client wrote "packing video"; the drafts describe a
  // buyer-recorded continuous parcel-opening video. Assumed the drafts are correct.
  // If the client means their own dispatch team films each order -> set to 'packing'
  // and the Refund Policy §3 heading + body must be rewritten by the client, not by us.
  exchangeEvidence: 'buyer-unboxing',   // 'buyer-unboxing' | 'packing' | 'both'

  // A3 — TRADEMARK. The client writes PRO-NOUN® throughout. We cannot verify registration.
  // Kept as the client wrote it, because it is their assertion about their own mark.
  // If unregistered or pending -> set false and every ® becomes ™ site-wide.
  trademarkRegistered: true,

  // A4 — BUSINESS NAME LINE. Client asked for "M. SANKHLECHA CREATION (pronounjeans)".
  // Kept their ordering (legal name first) but normalised the casing to the brand used
  // everywhere else on the site. If they want their literal string -> replace it here.
  // The ® is swapped for ™ at render time when trademarkRegistered is false, so this
  // string stays readable for the client's one-page decision list.
  displayName: 'M. Sankhlecha Creation (PRO-NOUN®)',

  // A5 — SUNDAY LINE. The client's new hours text omits it; the live site has it.
  // Assumed the omission was not deliberate. Set to '' to drop the line.
  closedLabel: 'Sunday & Public Holidays: Closed',

  // A6 — MOBILE FIELD. Assumed required: this is a B2B wholesale enquiry form and phone
  // is the primary channel in this trade. Set false to make it optional.
  mobileRequired: true,
  // Unticked opt-in, because these leads will be contacted on WhatsApp.
  whatsappConsentCheckbox: true,

  // A7 — ADDRESS. Four variants existed. Took the client's own most recent wording
  // (the "Who We Are" sign-off), which keeps "India" for the legal pages and uses
  // "Khokhra Road" to match the live site and the Google Business Profile.
  // "Near Anupam Cinema Road" (in the legal drafts only) was DROPPED for NAP consistency.
  addressLines: [
    'C-129/130, 1st Floor, Sharanam Square',
    'Khokhra Road, Opp. Gayatri Dairy Road',
    'Ahmedabad, Gujarat – 380008, India',
  ],

  // A8 — GRIEVANCE OFFICER. No name was supplied and we will not invent a person.
  // Published as a role with the business contact details. The E-Commerce Amendment
  // Rules want a named officer from 1 Jan 2027 -> fill in `name` when the client answers.
  grievance: {
    name: '',
    designation: 'Grievance Officer, M. Sankhlecha Creation',
    email: 'pronounjeans@gmail.com',
    phone: '9375143100',
  },

  // A9 — CLAIM WINDOW START. The client's note said "the courier's delivery confirmation";
  // both drafted documents say "the date of delivery". Published as drafted.
  claimWindowFrom: 'the date of delivery',

  // A10 — T&C CLAUSE 1 PRODUCT LIST. The draft lists capris and lounge wear, which are
  // not categories, and omits three that are. Replaced with the live catalogue (facts,
  // not promises). The client's About Us / Who We Are marketing copy was left VERBATIM,
  // so the two still differ — see the deviation list.
  legalProductCategories: [
    'cargo pants', 'formal trousers', 'cotton trousers', 'travel wear pants',
    'shorts', 'boxers', 'co-ord sets',
  ],

  // A11 — SIZE RANGE. Published the client's new copy: size sets L–2XL, L–3XL, M–3XL,
  // waist 28–36. The earlier how-to-order spec said made-to-order 28–70; if a
  // /how-to-order page exists saying that, DO NOT change it — report the conflict.
  sizeSets: ['L to 2XL', 'L to 3XL', 'M to 3XL'],
  waistRange: '28 to 36',

  // A12 — ABOUT PAGE VARIANT. The client supplied two overlapping texts. Both are stored
  // verbatim in aboutContent.js; this switch decides which renders. See Part C.
  aboutVariant: 'who-we-are',           // 'who-we-are' | 'about-us-long'

  // A13 — PUBLISH DATE. The drafts say 17 Nov 2026 but were not published that day.
  legalLastUpdated: '2026-11-18',
};
