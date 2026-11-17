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
//   { h1, tagline, intro?, sections: [{ id, heading, paragraphs?, cards? }],
//     closing: { lines, showAddress } }
// A section carries either paragraphs or cards, never both. `id` is the
// heading's anchor. `intro` is for a text that opens with paragraphs before
// its first heading, and `closing.lines` for one that signs off on more than
// one line — both of which the long variant does and the short one does not.
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
    lines: [`${PRO_NOUN} | Where Style Meets Comfort`],
    showAddress: true,
  },
};

// ── Variant: about-us-long (stored, not rendered) ───────────────────────────
//
// The client's full "ABOUT US | PRO-NOUN®" text, verbatim, in their order.
// Stored but not rendered: ASSUMPTIONS.aboutVariant selects 'who-we-are'.
// Flip that one value to publish this instead — no code change.
//
// Note for whoever makes that call: this text names a different product range
// from the short variant ("trousers, cargo pants, track pants, shorts and
// everyday casual wear" — track pants are not a catalogue category, and
// boxers, co-ord sets and formal trousers are missing). Marketing copy is the
// client's voice and is left alone either way, but it is a third product list
// after the short variant's and the Terms'.

const ABOUT_US_LONG = {
  h1: `About Us | ${PRO_NOUN}`,
  tagline: 'Fashion Should Empower, Not Constrict. Comfort Is the Ultimate Luxury.',
  intro: [
    `At ${PRO_NOUN}, we believe great clothing should make everyday life more comfortable. Fashion `
    + 'is not just about following trends. It is about finding the right balance between comfort, '
    + 'quality, fit and style.',
    `${BUSINESS.brand} is the men's bottom-wear brand of ${BUSINESS.legalName}, an Ahmedabad-based `
    + "manufacturer and wholesaler specialising in men's trousers, cargo pants, track pants, shorts "
    + 'and everyday casual wear.',
  ],
  sections: [
    {
      id: 'designed-for-comfort',
      heading: 'Designed for Comfort. Made for Everyday Life.',
      paragraphs: [
        'We understand that a good pair of trousers or cargo pants should do more than look good. '
        + 'It should offer comfortable movement, a practical fit and dependable quality.',
        'That is why we focus on carefully selected fabrics, thoughtful stitching, functional '
        + 'designs and comfortable fits. Our collections feature fabrics such as cotton, cotton '
        + 'Lycra, linen Lycra, khadi linen Lycra, Tencel linen, dobby and 4-way Lycra, with many '
        + 'styles featuring bio-washed finishes.',
        'From everyday casual trousers to stylish cargos and comfortable track pants, every '
        + 'collection is developed with practical use and changing customer preferences in mind.',
      ],
    },
    {
      id: 'quality-that-makes-a-difference',
      heading: 'Quality That Makes a Difference',
      paragraphs: [
        'We believe quality is in the details: the feel of the fabric, the finishing, the '
        + 'stitching, the fit and the durability of the garment.',
        'Our focus is to offer well-made, comfortable and affordable men\'s bottom wear that '
        + 'delivers excellent value to retailers and their customers.',
      ],
    },
    {
      id: 'supporting-retailers',
      heading: 'Supporting Retailers and Wholesale Businesses',
      paragraphs: [
        `${BUSINESS.brand} is built around the needs of the wholesale market. We supply ready size `
        + 'sets rather than individual pieces, making it easier for retailers to maintain a '
        + 'complete size range.',
        'With a minimum order of just one complete size set per design, retailers can introduce '
        + 'new collections with greater flexibility.',
        'We serve retailers, multi-brand outlets, distributors and online sellers across India, '
        + 'with dispatch from Ahmedabad through trusted logistics partners.',
      ],
    },
    {
      id: 'our-philosophy',
      heading: 'Our Philosophy',
      paragraphs: [
        "We don't believe good fashion needs to be complicated. It should be comfortable, "
        + 'practical, well-designed and accessible.',
        "Our aim is to make everyday men's fashion better through quality fabrics, reliable "
        + 'manufacturing and designs that combine comfort with contemporary style.',
      ],
    },
  ],
  closing: {
    lines: [
      `${PRO_NOUN} | Where Style Meets Comfort`,
      `Manufactured and marketed by ${BUSINESS.legalName}, ${BUSINESS.locality}, `
      + `${BUSINESS.region}, India.`,
    ],
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
