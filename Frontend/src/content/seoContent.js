// Page copy that has to be identical in two places: the React pages, and the
// server-rendered HTML that api/render.js sends to crawlers before any
// JavaScript runs. Plain data and pure functions only — no React, no DOM, no
// import.meta — so the Vercel function can import this file as-is.
//
// The catalogue is men's bottom-wear (cargo, travel-wear pants, trousers,
// formal pants, shorts, boxers). There are no jeans in it, so nothing here
// should say "jeans" or "denim" except the brand name itself.

export const BRAND = 'Pronoun Jeans';

export const SITE_TAGLINE = "Men's Bottom-wear Wholesale Manufacturer in Ahmedabad";

// Kept under 155 characters so neither Google nor Bing truncates it (Bing
// flagged the old 175-character version as "Meta Description too long").
// index.html carries the same text for the plain SPA shell — keep them equal.
export const SITE_DESCRIPTION =
  "Wholesale men's cargo pants, trousers, formal pants, shorts & boxers from Ahmedabad. "
  + 'Size sets, 1-set MOQ, pan-India dispatch.';

// ── The business (NAP: name, address, phone) ────────────────────────────────
//
// Must match the Google Business Profile character-for-character in meaning:
// Google and Bing cross-check name, address and phone across the site, the
// schema and the profile for local ranking. Everything that prints the
// address — Contact page, footer, JSON-LD, server render — reads it from here.

export const BUSINESS = {
  brand: BRAND,
  legalName: 'M. Sankhlecha Creation',
  phone: '+91 93751 43100',
  phoneE164: '+919375143100',
  phoneSchema: '+91-93751-43100',
  whatsapp: 'https://wa.me/919375143100',
  email: 'pronounjeans@gmail.com',
  streetAddress: 'C-129/130, 1st Floor, Sharanam Square, Khokhra Road, Opp. Gayatri Dairy Road',
  locality: 'Ahmedabad',
  region: 'Gujarat',
  postalCode: '380008',
  country: 'IN',
  // Pin of the Google Business Profile listing.
  latitude: 23.0049793,
  longitude: 72.6160975,
  mapUrl: 'https://maps.app.goo.gl/s9NX16aYkiNnHcfr6',
  hoursLabel: 'Mon – Sat: 10:00 AM – 6:30 PM',
  closedLabel: 'Sunday & Public Holidays: Closed',
};

/** The address as display lines (Contact page, server render). */
export const ADDRESS_LINES = [
  `${BRAND} (${BUSINESS.legalName})`,
  'C-129/130, 1st Floor, Sharanam Square',
  'Khokhra Road, Opp. Gayatri Dairy Road',
  `${BUSINESS.locality}, ${BUSINESS.region} — ${BUSINESS.postalCode}`,
];

// ── MOQ ─────────────────────────────────────────────────────────────────────
//
// Product.moq counts SETS, not pieces: the cart quantity is per variation and
// every variation is a size set ("L TO 3XL" = 4 pieces). The old copy said
// "MOQ 1 unit", which read as one garment next to a title saying "SET OF 5
// PCS". These say what is actually sold.

export const sets = (n) => `${n} set${Number(n) === 1 ? '' : 's'}`;

/** Distinct, sorted piece counts across a product's variations: [4, 5]. */
export function piecesPerSet(product) {
  const counts = new Set(
    (product?.variations ?? [])
      .map((v) => Number(v.pieces))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
  return [...counts].sort((a, b) => a - b);
}

/** "4 pcs" / "3–5 pcs" / '' when the variations carry no piece count. */
export function piecesLabel(product) {
  const counts = piecesPerSet(product);
  if (!counts.length) return '';
  const lo = counts[0];
  const hi = counts[counts.length - 1];
  return lo === hi ? `${lo} pcs` : `${lo}–${hi} pcs`;
}

/** "1 set (4 pcs)" — the one MOQ phrase used everywhere. */
export function moqLabel(product) {
  const moq = Number(product?.moq) || 1;
  const pcs = piecesLabel(product);
  return pcs ? `${sets(moq)} (${pcs} per set)` : sets(moq);
}

/** The size ranges a product is sold in: ["L TO 2XL", "L TO 3XL"]. */
export function sizeRanges(product) {
  return [...new Set((product?.variations ?? []).map((v) => (v.size || '').trim()).filter(Boolean))];
}

// ── Shared FAQs ─────────────────────────────────────────────────────────────

const FAQ_MOQ = {
  q: 'What is the minimum order quantity (MOQ)?',
  a: 'The MOQ is 1 set per design and colour. A set is one ready size range — for example L, XL, 2XL '
    + 'and 3XL — so a single set is usually 3 to 5 pieces. The exact pieces per set are listed on each product page.',
};

const FAQ_PRICES = {
  q: 'How do I see wholesale prices?',
  a: 'Prices are shown only to verified B2B buyers. Request a partner account with your shop or company '
    + 'details; once it is approved, sign in to see set prices, per-piece rates and margins and to order online.',
};

const FAQ_DISPATCH = {
  q: 'Do you deliver outside Ahmedabad?',
  a: 'Yes. Orders are packed at our Ahmedabad unit and shipped across India through logistics partners. '
    + 'Delivery usually takes 5–10 business days from dispatch, depending on your city.',
};

export const HOME_FAQS = [FAQ_MOQ, FAQ_PRICES, FAQ_DISPATCH, {
  q: 'Who can buy from Pronoun Jeans?',
  a: 'We sell wholesale only — to garment retailers, multi-brand outlets, distributors and online sellers. '
    + 'We do not sell single pieces to individual customers.',
}];

// ── Homepage ────────────────────────────────────────────────────────────────

export const HOME_HEADING = SITE_TAGLINE;

// The <title>. Shorter than the H1 so the full title (with " | Pronoun Jeans")
// stays around 60 characters and is not cut off in Google/Bing results.
export const HOME_TITLE = "Men's Bottom-wear Wholesale Maker in Ahmedabad";

export const HOME_INTRO =
  "Cargo pants, travel-wear pants, trousers, formal pants, shorts and boxers in bulk size sets — "
  + 'made in Ahmedabad for retailers and distributors across India.';

export const HOME_ABOUT = [
  "Pronoun Jeans is a men's bottom-wear manufacturer and wholesaler based in Ahmedabad, Gujarat. "
  + 'We design and produce cargo pants, travel-wear and lounge-wear track pants, linen and cotton '
  + 'trousers, Korean-fit formal pants, shorts and boxers, and sell them only to businesses.',
  'Every style is sold in ready size sets rather than loose pieces — L to 2XL, L to 3XL, M to 3XL or '
  + 'waist sizes 28 to 36, depending on the design — so your shelf gets a full size run in one order. '
  + 'The minimum order is just 1 set per design, which lets a new store try a style before buying deep.',
  'Our fabrics include pure cotton twill, linen lycra, khadi linen lycra, Tencel linen, cotton dobby '
  + 'lycra and 4-way lycra, most of them bio-washed for a soft, ready-to-wear hand feel. Retailers, '
  + 'multi-brand outlets, distributors and online sellers order from us across India, with dispatch '
  + 'from Ahmedabad through trusted logistics partners.',
];

// ── About ───────────────────────────────────────────────────────────────────

export const ABOUT_TITLE = "About Pronoun Jeans — Men's Bottom-wear Maker, Ahmedabad";
export const ABOUT_DESCRIPTION =
  'Pronoun Jeans (M. Sankhlecha Creation) makes men\'s cargo pants, trousers, track pants and shorts '
  + 'in Ahmedabad for retailers across India.';
export const ABOUT_HEADING = 'Fashion Should Empower, Not Constrict –';
export const ABOUT_HEADING_ACCENT = 'Comfort is the Ultimate Luxury.';
export const ABOUT_LEAD =
  "Awkward fits are our nemesis. At PRO-NOUN, we've never chased trends—we chase ease. "
  + "We've been in rooms where \"cool\" was dictated by rigid styles, but we'd rather redefine it: "
  + 'cool is the man who moves freely, unapologetically, in clothes that bend with his life. '
  + 'No gimmicks, no pretense—just designs that let you be.';
// The long brand paragraph. AboutUs.jsx renders the same words with a few
// italicised phrases; keep the two in step when the copy changes.
export const ABOUT_STORY =
  "A man's wardrobe should be two things: effortless and authentic. We believe luxury isn't in logos, "
  + 'but in the whisper-soft touch of cotton-Lycra, the precision of a stitch that outlasts seasons. '
  + 'We design for the man who does—whether he\'s navigating a workday or a weekend adventure—not '
  + 'the mannequin in a store window. Balance is everything, and it\'s hard: between durability and '
  + 'lightness, structure and stretch, trend and timelessness. Our relationships with fabric mills and '
  + "tailors span years; this isn't fast fashion, it's conscious craft. Celebrity flash? We'd "
  + 'rather elevate the everyday. Our mission? To make budget-friendly pieces feel premium, and premium '
  + "pieces feel lived-in. Confidence isn't vanity—it's self-respect. PRO-NOUN isn't about hiding behind "
  + "layers; it's about clothes that reveal you. And casual? We've mastered it: every pair of "
  + 'joggers, every cargo short, is a lesson in refined ease.';

// Plain facts for buyers (and search engines): who the firm is, what it
// makes, how it sells. Reuses the homepage "About" copy so the two never
// disagree.
export const ABOUT_WHO_HEADING = 'Who We Are';
export const ABOUT_WHO = [
  `${BRAND} (PRO-NOUN) is the menswear brand of ${BUSINESS.legalName}, a men's bottom-wear `
  + 'manufacturer and wholesaler at Sharanam Square, Khokhra Road, Ahmedabad.',
  ...HOME_ABOUT.slice(1),
];

export const ABOUT_VALUES = [
  { title: 'Comfort First', body: 'Every cut, every stitch is engineered around how the human body actually moves—not how it looks on a hanger.' },
  { title: 'Conscious Craft', body: 'Long-term relationships with mills and tailors mean every piece is built to outlast fast fashion by years.' },
  { title: 'Honest Pricing', body: 'Premium feel without the premium markup. Budget-friendly pieces that refuse to feel budget.' },
];

// ── Contact ─────────────────────────────────────────────────────────────────

export const CONTACT_TITLE = 'Contact Us — Wholesale Enquiry, Ahmedabad';
export const CONTACT_DESCRIPTION =
  'WhatsApp or call +91 93751 43100 for men\'s bottom-wear wholesale rates and catalogue. '
  + 'Sharanam Square, Khokhra Road, Ahmedabad 380008.';
export const CONTACT_HEADING = 'Contact Our Wholesale Team';
export const CONTACT_INTRO =
  'Reach out to discuss bulk orders, partnership inquiries, or any questions about our B2B programme.';

export const CATALOG_TITLE = "Wholesale Men's Bottom-wear Catalogue — Cargo, Trousers & Shorts";

export const CATALOG_DESCRIPTION =
  "Browse Pronoun Jeans' wholesale catalogue of men's cargo pants, travel-wear pants, trousers, "
  + 'formal pants, shorts and boxers — sold in ready size sets, MOQ 1 set per design.';

// ── Categories ──────────────────────────────────────────────────────────────
//
// Defaults for the long-form copy and FAQs on /catalog/:slug. The admin panel
// can override both per category (Category.content / Category.faqs); blank
// there means "use these". Keyed by slug, so a renamed category keeps its copy
// and a new one simply gets the generic fallback until someone writes it.

export const CATEGORY_CONTENT = {
  'cargo-pant': {
    heading: "Wholesale Men's Cargo Pants",
    paragraphs: [
      "Pronoun Jeans manufactures men's cargo pants in Ahmedabad for retailers who want a dependable, "
      + 'fast-moving bottom-wear line. Our cargos have practical side utility pockets and a comfortable '
      + 'cut that works for daily wear, travel and casual outings.',
      'Cargo pants are sold in ready size sets of L to 3XL (4 pieces) and L to 4XL (5 pieces), '
      + 'so one order covers your full size run. The minimum order is 1 set per design and colour — '
      + 'small enough to test a new style, and you can scale up colour by colour as it sells.',
      'This range suits menswear shops, multi-brand outlets, workwear and outdoor stores, and online '
      + 'sellers looking for a practical everyday product with steady repeat demand. Fabric, wash and '
      + 'the exact pieces per set are listed on each product page.',
      'Orders are packed at our Ahmedabad unit and dispatched across India. Verified B2B buyers can see '
      + 'set prices and per-piece rates after signing in, and order online in a few clicks.',
    ],
    faqs: [
      { q: 'What sizes do the cargo pant sets include?',
        a: 'Cargo pants come in L to 3XL sets (4 pieces) and larger L to 4XL sets (5 pieces). The breakdown for each design is on its product page.' },
      FAQ_MOQ, FAQ_DISPATCH, FAQ_PRICES,
    ],
  },

  'travel-wear-pant': {
    heading: "Wholesale Men's Travel-wear & Lounge-wear Pants",
    paragraphs: [
      "Our travel-wear pants are lightweight, breathable men's pants built for long journeys, office "
      + 'commutes and relaxed weekends. The range includes pure cotton 30s twill pants with front zip '
      + 'pockets, linen lycra and Tencel linen lounge-wear track pants, and stretch cotton cargo track pants.',
      'Most styles are bio-washed for an ultra-soft feel and come in relaxed or slim fits with a 40-inch '
      + 'length. They are sold in ready size sets — M to 2XL, M to 3XL, L to 2XL or L to 3XL, usually 3 to 5 '
      + 'pieces per set — in a wide colour range including black, navy, olive, beige, grey and pista.',
      'The minimum order is 1 set per design and colour, which makes it easy for menswear stores, '
      + 'multi-brand outlets and online sellers to stock several colours without a large upfront buy. '
      + 'Travel-wear pants sell all year and are a strong add-on for shops already selling t-shirts and shirts.',
      'Every order is packed in Ahmedabad and dispatched pan-India. Sign in as a verified B2B buyer to see '
      + 'set prices, per-piece rates and live stock for each colour.',
    ],
    faqs: [
      { q: 'Which fabrics are used in travel-wear pants?',
        a: 'Pure cotton 30s twill, linen lycra, Tencel linen and stretch cotton, most of them bio-washed. Each product page lists the exact fabric.' },
      FAQ_MOQ, FAQ_DISPATCH, FAQ_PRICES,
    ],
  },

  shorts: {
    heading: "Wholesale Men's Shorts",
    paragraphs: [
      "Pronoun Jeans makes men's shorts for travel, lounge and summer wear — cargo shorts with zip pockets, "
      + 'elastic-waist travel shorts and plain knee-length shorts. Fabrics include cotton dobby lycra, khadi '
      + 'linen lycra, Oxford lycra, linen and pure cotton 40s twill, most of them bio-washed and breathable.',
      'Shorts are cut to a 20-inch knee length with a relaxed fit and are sold in ready size sets: L to 2XL '
      + '(3 pieces), L to 3XL (4 pieces), waist sizes 30 to 36 or 30 to 38, and a 4XL to 5XL plus-size set. '
      + 'Colours run from black, grey and olive to beige, pista, mint grey and slate blue.',
      'The minimum order is 1 set per design and colour, so a store can carry many colours in small depth '
      + 'and reorder the best sellers. Shorts suit menswear '
      + 'retailers, beach and travel stores, sportswear shops and online sellers.',
      'All orders are dispatched from Ahmedabad to anywhere in India. Verified B2B buyers can sign in to '
      + 'see set prices, per-piece rates and stock by colour.',
    ],
    faqs: [
      { q: 'What length are the shorts?',
        a: 'Most styles are a 20-inch knee length with a relaxed fit. The exact length is shown on each product page.' },
      { q: 'Do you make plus-size shorts?',
        a: 'Yes. Several designs are available in a 4XL to 5XL set in addition to the standard L to 3XL sets.' },
      FAQ_MOQ, FAQ_DISPATCH,
    ],
  },

  'cotton-trousers': {
    heading: "Wholesale Men's Cotton & Linen Trousers",
    paragraphs: [
      "Our men's trousers are smart-casual ankle-length pants that work for office, college and evening "
      + 'wear. The range is made in premium 10x10 linen lycra — breathable like linen, with lycra stretch '
      + 'for comfort — and bio-washed for a soft, crease-friendly finish.',
      'Trousers are cut in a slim fit and sold by waist size in ready sets of 28 to 36 (5 pieces per set). '
      + 'Colours include black, beige, light grey, ace grey, cookies and elaichi, so one design can fill a '
      + 'full colour wall.',
      'The minimum order is 1 set per design and colour. This range suits menswear boutiques, '
      + 'multi-brand outlets and online sellers who want a premium-looking trouser at a wholesale price, '
      + 'and pairs well with shirts and polo t-shirts. The bio-washed linen lycra keeps its shape after '
      + 'washing, which means fewer complaints at the counter.',
      'Orders are packed in Ahmedabad and shipped pan-India. Verified B2B buyers can sign in to see set '
      + 'prices and per-piece rates for each colour.',
    ],
    faqs: [
      { q: 'What waist sizes are in a trouser set?',
        a: 'Trouser sets run from waist 28 to 36, five pieces per set. Each product page shows the exact breakdown.' },
      FAQ_MOQ, FAQ_DISPATCH, FAQ_PRICES,
    ],
  },

  'formal-pants': {
    heading: "Wholesale Men's Formal Pants",
    paragraphs: [
      "Pronoun Jeans' formal pants are Korean-fit men's trousers in a 4-way lycra stretch fabric — sharp "
      + 'enough for office wear and comfortable enough for all-day use, in the slim, tapered Korean fit '
      + 'that younger customers ask for.',
      'Formal pants are sold by waist size in ready sets of 30 to 36 (4 pieces per set), with a 42-inch '
      + 'length and a raw, unwashed finish that keeps the fabric crisp. The stretch fabric recovers its '
      + 'shape through the day, so the trouser looks as sharp in the evening as it did in the morning. Current colours include black, copper, rose brown and slate blue.',
      'The minimum order is 1 set per design and colour, so formal-wear shops, menswear retailers, '
      + 'uniform suppliers and online sellers can try the fit before ordering in depth.',
      'Every order is dispatched from Ahmedabad to anywhere in India. Sign in as a verified B2B buyer to '
      + 'see set prices and per-piece rates.',
    ],
    faqs: [
      { q: 'What is a Korean-fit formal pant?',
        a: 'A slim, slightly tapered trouser with a shorter rise and a clean ankle. Ours are made in 4-way stretch lycra for comfort.' },
      FAQ_MOQ, FAQ_DISPATCH, FAQ_PRICES,
    ],
  },

  boxers: {
    heading: "Wholesale Men's Boxers",
    paragraphs: [
      "Pronoun Jeans makes men's boxer shorts in pure cotton yarn-dyed checks — breathable, soft and "
      + 'comfortable for sleep, lounging and summer home wear. Because the checks are yarn-dyed, the '
      + 'pattern is woven into the fabric rather than printed on top.',
      'Boxers are a low-ticket, repeat-purchase product for menswear stores, '
      + 'innerwear and hosiery shops, general stores and online marketplaces. They are sold wholesale in '
      + 'assorted checks and sizes. The elastic waist means one style fits a wide range of customers, '
      + 'and the breathable cotton makes boxers an all-season product rather than a summer-only one.',
      'The minimum order is 1 set per design. Orders are packed in Ahmedabad and dispatched across India. '
      + 'Verified B2B buyers can sign in to see wholesale prices and order online.',
    ],
    faqs: [
      { q: 'What fabric are the boxers made of?',
        a: 'Pure cotton with yarn-dyed checks, so the pattern is woven in rather than printed.' },
      FAQ_MOQ, FAQ_DISPATCH, FAQ_PRICES,
    ],
  },

  'co-ord-set': {
    heading: "Wholesale Men's Co-ord Sets",
    paragraphs: [
      "Pronoun Jeans' co-ord sets are matching men's top-and-bottom outfits for travel, resort and "
      + 'casual wear — made in Ahmedabad in the same breathable cotton and linen-blend fabrics as our '
      + 'travel-wear range. A co-ord set gives your customer a complete, matching look in one purchase, '
      + 'which makes it an easy upsell next to our travel-wear pants and shorts.',
      'Like the rest of the catalogue, co-ord sets are sold wholesale in ready size sets, with a minimum '
      + 'order of 1 set per design and colour. They suit menswear boutiques, multi-brand outlets and '
      + 'online sellers looking for a coordinated, ready-to-sell outfit.',
      'New co-ord designs are being added. Message us on WhatsApp for the current designs, fabrics and '
      + 'rates, or sign in as a verified B2B buyer to order as soon as they go live. Orders are dispatched '
      + 'from Ahmedabad across India.',
    ],
    faqs: [FAQ_MOQ, FAQ_DISPATCH, FAQ_PRICES],
  },
};

/** Generic copy for a category nobody has written yet. */
function genericCategoryContent(name) {
  const lower = (name || 'bottom-wear').toLowerCase();
  return {
    heading: `Wholesale Men's ${name || 'Bottom-wear'}`,
    paragraphs: [
      `Pronoun Jeans manufactures men's ${lower} in Ahmedabad and sells them wholesale to retailers, `
      + 'multi-brand outlets, distributors and online sellers across India.',
      'Every style is sold in ready size sets, with a minimum order of 1 set per design and colour. The '
      + 'fabric, size range and pieces per set are listed on each product page.',
      'Orders are packed in Ahmedabad and dispatched pan-India. Verified B2B buyers can sign in to see '
      + 'set prices and per-piece rates.',
    ],
    faqs: [FAQ_MOQ, FAQ_DISPATCH, FAQ_PRICES],
  };
}

/**
 * The copy a category page shows. An admin-written `content` (paragraphs
 * separated by blank lines) or `faqs` on the category wins over the default.
 */
export function categoryContent(category) {
  const fallback = CATEGORY_CONTENT[category?.slug] ?? genericCategoryContent(category?.name);
  const written = String(category?.content ?? '').trim();
  const faqs = Array.isArray(category?.faqs)
    ? category.faqs.filter((f) => f && String(f.q ?? '').trim() && String(f.a ?? '').trim())
    : [];
  return {
    heading: fallback.heading,
    paragraphs: written ? written.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
                        : fallback.paragraphs,
    faqs: faqs.length ? faqs : fallback.faqs,
  };
}

/** schema.org FAQPage for a list of {q, a}. */
export function faqSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// ── Generated titles and descriptions ───────────────────────────────────────
//
// Used by the React pages (via config/seoCopy.js), the admin panel's Google
// preview, and the server render. One implementation, so all three agree.

export const TITLE_SUFFIX = ` | ${BRAND}`;

export function withBrandSuffix(title) {
  const text = String(title ?? '').trim();
  if (!text) return BRAND;
  return text.includes(BRAND) ? text : `${text}${TITLE_SUFFIX}`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', reg: '®' };

/**
 * Free text typed into the admin panel, flattened to plain text: tags,
 * WordPress [embed] shortcodes and literal "\n" sequences (an artefact of the
 * old WooCommerce import) removed, entities decoded. Keeps paragraph breaks
 * as "\n\n" so callers can split on them.
 */
export function plainText(value) {
  if (!value) return '';
  return String(value)
    .replace(/\[embed\][\s\S]*?\[\/embed\]/gi, ' ')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function clampDescription(text, max = 160) {
  const normalised = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (normalised.length <= max) return normalised;
  const cut = normalised.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—–-]+$/, '')}…`;
}

export function productSeoTitle(product) {
  return `${product.name} — Wholesale ${product.category_name || "Men's Bottom-wear"}`;
}

export function productSeoDescription(product) {
  const fabric = plainText(product.fabric_details).split(/[.\n]/)[0].trim();
  const pcs = piecesLabel(product);
  const category = (product.category_name || "men's bottom-wear").toLowerCase();
  return [
    `${product.name} — wholesale ${category} from ${BRAND}, Ahmedabad.`,
    fabric && `${fabric}.`,
    `Sold in size sets${pcs ? ` of ${pcs}` : ''}, MOQ ${sets(Number(product.moq) || 1)}, pan-India dispatch.`,
  ].filter(Boolean).join(' ');
}

export function categorySeoTitle(category) {
  return `${category.name} — Wholesale ${category.name} Manufacturer`;
}

export function categorySeoDescription(category) {
  return `Wholesale men's ${(category.name || '').toLowerCase()} from ${BRAND}, Ahmedabad. `
    + 'Ready size sets, MOQ 1 set per design, pan-India dispatch for retailers.';
}
