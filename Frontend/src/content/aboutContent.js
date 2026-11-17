// The /about page's copy, as data.
//
// The client supplied two overlapping texts. Both are stored here verbatim and
// ASSUMPTIONS.aboutVariant decides which one renders, so switching between
// them is a one-line change in the ledger and no code change at all.
//
// Structured data rather than JSX or HTML strings, because two renderers have
// to produce the same page from it: src/pages/AboutUs.jsx and aboutPage() in
// api/render.js (the server-rendered HTML crawlers read before any JavaScript
// runs). Neither may hold copy the other does not.
//
// Shape:
//   { h1, tagline, sections: [{ id, heading, paragraphs?, cards? }],
//     closing: { line, showAddress } }
// A section carries either paragraphs or cards, never both. `id` is the
// heading's anchor.
//
// Nothing here is paraphrased. Hyphen bullets became cards and the ® goes
// through mark() so one flag controls the symbol, but no sentence was
// reworded, shortened, merged or improved — including the awkward ones
// ("Boxers And Co-ord Sets, Other bottom-wear collections" is the client's
// own wording and stays).

import { ASSUMPTIONS as A } from './assumptions.js';
import { BUSINESS, mark } from './seoContent.js';

const PRO_NOUN = mark(BUSINESS.brand);

// ── Variant: who-we-are (the default) ──────────────────────────────────────

const WHO_WE_ARE = {
  h1: 'About Us',
  tagline: 'Fashion Should Empower, Not Constrict. Comfort Is the Ultimate Luxury.',
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who We Are',
      paragraphs: [
        `${PRO_NOUN} is the men's bottom-wear brand of ${BUSINESS.legalName}, an Ahmedabad-based `
        + "manufacturer and wholesaler specialising in men's Travel Wear, Formal Trousers, Casual "
        + 'Trousers, Cargo Pants, Shorts, Boxers And Co-ord Sets, Other bottom-wear collections.',
        'Located at Sharanam Square, Khokhra Road, Ahmedabad, Gujarat, we focus on providing '
        + 'retailers and wholesale buyers with quality fabrics, comfortable fits, practical designs '
        + 'and dependable wholesale service.',
      ],
    },
    {
      id: 'products-quality',
      heading: 'Our Products & Quality',
      paragraphs: [
        "Our collection includes men's bottom wear made using a variety of fabrics, including Pure "
        + 'Cotton Twill, Linen Lycra, Khadi Linen Lycra, Tencel Linen, Cotton Dobby Lycra and 4-Way '
        + 'Lycra. Many of our styles feature bio-washed fabrics for a soft feel, comfort and '
        + 'everyday wearability.',
      ],
    },
    {
      id: 'wholesale-ordering',
      heading: 'Wholesale Ordering Made Easy',
      paragraphs: [
        // The size sets and the waist range are read from the ledger rather
        // than typed, so correcting them is one edit. The sentence the client
        // wrote is reproduced exactly around them.
        `At ${BUSINESS.brand}, products are available in ready size sets rather than individual `
        + `pieces. Depending on the design, size sets include ${A.sizeSets.join(', ')} and waist `
        + `sizes ${A.waistRange}.`,
        'Our minimum order quantity starts from just 1 complete size set per design, allowing '
        + 'retailers to introduce new styles without committing to large quantities.',
      ],
    },
    {
      id: 'serving-buyers',
      heading: 'Serving Wholesale Buyers Across India',
      paragraphs: [
        'We serve retailers, multi-brand outlets, distributors and online sellers across India. '
        + 'Orders are dispatched from Ahmedabad through trusted logistics partners, helping '
        + "businesses source men's bottom wear conveniently.",
      ],
    },
    {
      id: 'what-we-stand-for',
      heading: 'What We Stand For',
      cards: [
        {
          title: 'Comfort First',
          body: 'Every garment is designed with comfort, practical fits and freedom of movement in '
            + 'mind. We focus on quality fabrics, comfortable fits and everyday wearability, so your '
            + 'customers feel good in every pair.',
        },
        {
          title: 'Quality Craftsmanship',
          body: 'From fabric selection to stitching and finishing, we pay attention to the details '
            + 'that matter. Our focus is on dependable quality, thoughtful designs and comfortable '
            + "men's bottom wear made for everyday use.",
        },
        {
          title: 'Honest Pricing',
          body: 'Good quality should offer great value. We focus on delivering well-made, stylish '
            + "and comfortable men's bottom wear at competitive prices, helping retailers offer "
            + 'better products to their customers.',
        },
      ],
    },
    {
      id: 'our-commitment',
      heading: 'Our Commitment',
      paragraphs: [
        `At ${BUSINESS.brand}, our focus is simple: delivering the best products with comfortable `
        + 'fabrics, practical designs and reliable wholesale service.',
      ],
    },
  ],
  closing: {
    line: `${PRO_NOUN} | Where Style Meets Comfort`,
    showAddress: true,
  },
};

// ── Variant: about-us-long (stored, not rendered) ───────────────────────────
//
// INCOMPLETE — the client's long "ABOUT US | PRO-NOUN®" text was not supplied
// with the brief. Its section headings and its sign-off were, and they are
// recorded below in the client's order so that the structure is ready; the
// body paragraphs are deliberately empty because inventing the client's
// marketing voice is not ours to do. Paste each section's sentences into its
// `paragraphs` array verbatim, then flip ASSUMPTIONS.aboutVariant.
//
// Until then this variant renders its headings and sign-off and nothing else,
// which is why the default stays 'who-we-are'.

const ABOUT_US_LONG = {
  h1: `About Us | ${PRO_NOUN}`,
  tagline: 'Fashion Should Empower, Not Constrict. Comfort Is the Ultimate Luxury.',
  sections: [
    { id: 'designed-for-comfort', heading: 'Designed for Comfort. Made for Everyday Life.', paragraphs: [] },
    { id: 'quality-that-makes-a-difference', heading: 'Quality That Makes a Difference', paragraphs: [] },
    { id: 'supporting-retailers', heading: 'Supporting Retailers and Wholesale Businesses', paragraphs: [] },
    { id: 'our-philosophy', heading: 'Our Philosophy', paragraphs: [] },
  ],
  closing: {
    line: `Manufactured and marketed by ${BUSINESS.legalName}, ${BUSINESS.locality}, `
      + `${BUSINESS.region}, India.`,
    showAddress: true,
  },
};

// ── The switch ──────────────────────────────────────────────────────────────

export const ABOUT_VARIANTS = {
  'who-we-are': WHO_WE_ARE,
  'about-us-long': ABOUT_US_LONG,
};

/** The variant ASSUMPTIONS.aboutVariant selects, falling back to the default. */
export function aboutContent(variant = A.aboutVariant) {
  return ABOUT_VARIANTS[variant] ?? WHO_WE_ARE;
}

/** The address block under the closing line, from BUSINESS. */
export const aboutAddressLines = () => [BUSINESS.displayName, ...BUSINESS.addressLines];
