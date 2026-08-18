// Builders for the per-page JSON-LD blocks.
//
// Kept as plain functions returning plain objects so they can be reasoned
// about — and diffed — without a render. <JsonLd> does the serialising.
//
// The site-wide Organization and LocalBusiness nodes live in index.html and
// describe the business, not the page. Anything here that refers to them does
// so by @id rather than restating them, so consumers resolve one entity
// instead of several near-duplicates.

import { SITE_URL, SITE_NAME, absoluteUrl } from './site';

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const LOCAL_BUSINESS_ID = `${SITE_URL}/#localbusiness`;

const POSTAL_ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress: 'Textile Market, Ring Road',
  addressLocality: 'Ahmedabad',
  addressRegion: 'Gujarat',
  postalCode: '380002',
  addressCountry: 'IN',
};

// Read off the company's own Google Business Profile pin — the same place the
// address links to from the footer and the contact page.
const GEO = {
  '@type': 'GeoCoordinates',
  latitude: 23.0147644,
  longitude: 72.5972153,
};

// Mon–Sat 10:00–18:30, matching the hours shown on /contact. Sunday is absent
// rather than listed as closed: an omitted day already means closed, and a
// second entry would be one more thing to keep in step with the page copy.
const OPENING_HOURS = [
  {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    opens: '10:00',
    closes: '18:30',
  },
];

/** Absolute, deduped, http(s)-only image list. */
function imageList(...candidates) {
  const seen = new Set();
  return candidates
    .flat()
    .filter((url) => typeof url === 'string' && /^https?:\/\//.test(url))
    .filter((url) => (seen.has(url) ? false : seen.add(url)))
    .slice(0, 8);
}

/**
 * BreadcrumbList. `trail` is [{ name, path }] from the site root inwards;
 * the last entry is the current page.
 */
export function breadcrumbSchema(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * Homepage WebSite node.
 *
 * No `potentialAction`/SearchAction: the only search on the site is the
 * in-page product filter on a category page, which has no linkable URL for a
 * query. Declaring a search endpoint that does not exist would be a lie that
 * Google would then try to use.
 */
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    inLanguage: 'en-IN',
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/** /catalog — the collection of category pages. */
export function catalogPageSchema(categories = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${absoluteUrl('/catalog')}#collectionpage`,
    url: absoluteUrl('/catalog'),
    name: 'Wholesale Denim Catalogue',
    description:
      "Wholesale men's jeans, cargo pants, joggers and casual bottomwear from Pronoun Jeans, "
      + 'sold in ready size sets with a minimum order quantity.',
    inLanguage: 'en-IN',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    about: { '@id': ORGANIZATION_ID },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: categories.length,
      itemListElement: categories.map((category, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: category.name,
        url: absoluteUrl(`/catalog/${category.slug}`),
      })),
    },
  };
}

/** /catalog/:slug — the products within one category. */
export function categoryItemListSchema({ name, slug, products = [] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${absoluteUrl(`/catalog/${slug}`)}#itemlist`,
    name: `Wholesale ${name}`,
    numberOfItems: products.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: products.map((product, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: product.name,
      url: absoluteUrl(`/product/${product.slug}`),
    })),
  };
}

/**
 * /product/:slug — Product plus a single Offer.
 *
 * No price, and none can leak: b2b_price and set_price come back null for
 * anonymous callers (IsVerifiedB2B gates them), which is exactly who the
 * prerenderer and every crawler are. The Offer therefore carries currency,
 * availability, business function and the MOQ, and stays silent on amount.
 * The cost is that Google will not award a Product rich result without a
 * price — the deliberate trade for not publishing wholesale rates.
 */
export function productSchema(product) {
  const variations = product.variations ?? [];
  const inStock = variations.reduce((sum, v) => sum + (v.stock_quantity ?? 0), 0) > 0;

  const images = imageList(
    product.image,
    (product.gallery_images ?? []).map((img) => img.image),
    variations.map((v) => v.image),
  );

  const description = [product.description, product.fabric_details]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${absoluteUrl(`/product/${product.slug}`)}#product`,
    name: product.name,
    url: absoluteUrl(`/product/${product.slug}`),
    brand: { '@type': 'Brand', name: SITE_NAME },
    manufacturer: { '@id': ORGANIZATION_ID },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/product/${product.slug}`),
      priceCurrency: 'INR',
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
      seller: { '@id': ORGANIZATION_ID },
      // The MOQ, in pieces. C62 is the UN/CEFACT code for a countable unit,
      // which is what schema.org expects here rather than the word "units".
      eligibleQuantity: {
        '@type': 'QuantitativeValue',
        minValue: product.moq,
        unitCode: 'C62',
      },
      eligibleCustomerType: 'http://purl.org/goodrelations/v1#Business',
    },
  };

  if (description) schema.description = description;
  if (images.length) schema.image = images;
  if (product.category_name) schema.category = product.category_name;

  // The API does not serialise Product.code, so the closest real identifier is
  // the first variation's SKU — every variant SKU is built from the same
  // product code prefix. Omitted rather than faked when there are no variants.
  const sku = variations.find((v) => v.sku)?.sku;
  if (sku) schema.sku = sku;

  return schema;
}

/** /contact — the same LocalBusiness entity as index.html, enriched with geo. */
export function contactLocalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': LOCAL_BUSINESS_ID,
    name: SITE_NAME,
    legalName: 'Pronoun Jeans Pvt. Ltd.',
    url: `${SITE_URL}/`,
    image: `${SITE_URL}/og-default.jpg`,
    telephone: '+91-93751-43100',
    email: 'pronounjeans@gmail.com',
    priceRange: '$$',
    parentOrganization: { '@id': ORGANIZATION_ID },
    address: POSTAL_ADDRESS,
    geo: GEO,
    areaServed: { '@type': 'Country', name: 'IN' },
    openingHoursSpecification: OPENING_HOURS,
    hasMap: 'https://maps.app.goo.gl/s9NX16aYkiNnHcfr6',
  };
}
