// The site-wide entity markup: who the business is, where it is, when it is
// open. Plain functions over BUSINESS, taking the origin as an argument.
//
// Why it lives here rather than in src/config/schema.js: three places need
// this exact JSON-LD — index.html (the pre-hydration shell), the React
// /contact page, and api/render.js (the server-rendered /contact). schema.js
// imports config/site.js, which reads import.meta.env, so a Vercel function
// cannot import it; render.js therefore kept its own hand-copied contactSchema()
// and the two drifted (the function still published 10:00–18:30 after the
// hours changed). Nothing in this file touches import.meta, so all three can
// import it, and `siteUrl` is passed in instead of being read from the bundler.

import { BUSINESS, phoneE164, openDayNames } from './seoContent.js';

/** Profiles that are unambiguously this business — schema.org sameAs. */
export const SOCIAL_PROFILES = [
  'https://www.instagram.com/pronounjeans/',
  'https://www.facebook.com/pronounjeans/',
];

export const organizationId = (siteUrl) => `${siteUrl}/#organization`;
export const localBusinessId = (siteUrl) => `${siteUrl}/#localbusiness`;

/** The postal address, identical everywhere it is emitted. */
export function postalAddress() {
  return {
    '@type': 'PostalAddress',
    streetAddress: BUSINESS.streetAddress,
    addressLocality: BUSINESS.locality,
    addressRegion: BUSINESS.region,
    postalCode: BUSINESS.postalCode,
    addressCountry: BUSINESS.country,
  };
}

/**
 * Opening hours, from BUSINESS.openDays/opensAt/closesAt — the same three
 * values the visible "Mon – Sat: 11:00 AM – 8:00 PM" label is derived from.
 * Sunday is absent rather than listed as closed: an omitted day already means
 * closed to a consumer, and a second entry would be one more thing to keep in
 * step with the page copy.
 */
export function openingHours() {
  return [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: openDayNames(BUSINESS.openDays),
    opens: BUSINESS.opensAt,
    closes: BUSINESS.closesAt,
  }];
}

/**
 * The Organization node.
 *
 * `name` is the brand, not the "legal name (brand)" line the pages now print
 * above the address: schema.org has `legalName` for the registered entity and
 * `name` for what people call it, and collapsing the two would leave Google
 * matching the Business Profile against a string no one searches for. The
 * brand's other spelling is kept in alternateName for the same reason.
 */
export function organizationSchema(siteUrl) {
  return {
    '@type': 'Organization',
    '@id': organizationId(siteUrl),
    name: BUSINESS.brand,
    legalName: BUSINESS.legalName,
    alternateName: ['Pronoun Jeans', 'pronounjeans'],
    url: `${siteUrl}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${siteUrl}/logo.png`,
      width: 716,
      height: 348,
    },
    image: `${siteUrl}/og-default.jpg`,
    description: "B2B manufacturer and wholesale supplier of men's bottom-wear — cargo pants, "
      + 'travel-wear pants, trousers, formal pants, shorts and boxers — based in Ahmedabad, Gujarat.',
    email: BUSINESS.email,
    telephone: phoneE164(BUSINESS.phone),
    address: postalAddress(),
    areaServed: { '@type': 'Country', name: BUSINESS.country },
    sameAs: SOCIAL_PROFILES,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      telephone: phoneE164(BUSINESS.phone),
      email: BUSINESS.email,
      areaServed: BUSINESS.country,
      availableLanguage: ['en', 'hi', 'gu'],
    },
  };
}

/** The LocalBusiness node — the same entity, with the pin and the hours. */
export function localBusinessSchema(siteUrl) {
  return {
    '@type': 'LocalBusiness',
    '@id': localBusinessId(siteUrl),
    parentOrganization: { '@id': organizationId(siteUrl) },
    name: BUSINESS.brand,
    legalName: BUSINESS.legalName,
    url: `${siteUrl}/`,
    image: `${siteUrl}/og-default.jpg`,
    telephone: phoneE164(BUSINESS.phone),
    email: BUSINESS.email,
    priceRange: '$$',
    geo: {
      '@type': 'GeoCoordinates',
      latitude: BUSINESS.latitude,
      longitude: BUSINESS.longitude,
    },
    hasMap: BUSINESS.mapUrl,
    address: postalAddress(),
    areaServed: { '@type': 'Country', name: BUSINESS.country },
    sameAs: SOCIAL_PROFILES,
    openingHoursSpecification: openingHours(),
  };
}

/**
 * Both nodes as one @graph — what index.html carries on every route.
 * Injected at build time by the entity-jsonld plugin in vite.config.js, so
 * the shell cannot hold a stale hand-typed copy of the address or the hours.
 */
export function entityGraph(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationSchema(siteUrl), localBusinessSchema(siteUrl)],
  };
}

/**
 * /contact — the same LocalBusiness entity, standalone.
 *
 * Same @id as the node in the shell, so a consumer resolves one entity rather
 * than two near-duplicates.
 */
export function contactLocalBusinessSchema(siteUrl) {
  return {
    '@context': 'https://schema.org',
    ...localBusinessSchema(siteUrl),
  };
}
