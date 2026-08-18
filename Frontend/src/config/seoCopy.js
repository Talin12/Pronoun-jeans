// The generated titles and descriptions, in one place.
//
// These are used twice, and the two uses must agree: the storefront renders
// them when a product or category has no hand-written override, and the admin
// panel's Google preview shows what would be rendered. A preview built from a
// second, slightly different copy of the rules is worse than no preview — it
// would quietly tell the person writing the copy something untrue.

import { SITE_NAME, TITLE_SUFFIX, clampDescription } from './site';

export const META_TITLE_MAX = 70;
export const META_DESCRIPTION_MAX = 160;

/** Mirrors <Seo>: the brand is appended unless the title already names it. */
export function withBrandSuffix(title) {
  const text = (title ?? '').trim();
  if (!text) return SITE_NAME;
  return text.includes(SITE_NAME) ? text : `${text}${TITLE_SUFFIX}`;
}

/**
 * Entity-decode and flatten free text typed into the admin panel.
 *
 * Descriptions come back with HTML entities and hard line breaks in them;
 * neither belongs in a meta tag.
 */
function plainText(value) {
  if (!value) return '';
  const doc = new DOMParser().parseFromString(String(value), 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// ── Products ─────────────────────────────────────────────────────────────────

export function productSeoTitle(product) {
  return `${product.name} — Wholesale ${product.category_name || 'Denim'}`;
}

/**
 * Assembled from whatever the product actually carries. fabric_details is free
 * text typed into the admin panel and is blank on plenty of SKUs, so it is cut
 * to its first sentence and dropped entirely when missing rather than leaving a
 * dangling clause in the search snippet.
 */
export function productSeoDescription(product) {
  const fabric = plainText(product.fabric_details).split(/[.\n]/)[0].trim();
  const moq = Number(product.moq) || 0;
  return [
    `${product.name} — wholesale ${(product.category_name || 'denim').toLowerCase()} from ${SITE_NAME}, Ahmedabad.`,
    fabric && `${fabric}.`,
    `Sold in size sets, MOQ ${moq} unit${moq === 1 ? '' : 's'}, with pan-India dispatch for retailers.`,
  ].filter(Boolean).join(' ');
}

// ── Categories ───────────────────────────────────────────────────────────────

export function categorySeoTitle(category) {
  return `${category.name} — Wholesale ${category.name} Manufacturer`;
}

export function categorySeoDescription(category) {
  return `Wholesale ${(category.name || '').toLowerCase()} from ${SITE_NAME}, a B2B denim `
    + 'manufacturer in Ahmedabad. Bulk size sets, MOQ pricing and pan-India dispatch for retailers.';
}

// ── What actually ships ──────────────────────────────────────────────────────
//
// Blank is meaningful: it means "generate it". These resolve an override
// against its fallback the same way the pages do.

export function effectiveProductSeo(product) {
  const title = (product.meta_title || '').trim() || productSeoTitle(product);
  const description = (product.meta_description || '').trim() || productSeoDescription(product);
  return {
    title: withBrandSuffix(title),
    description: clampDescription(description),
    generatedTitle: !((product.meta_title || '').trim()),
    generatedDescription: !((product.meta_description || '').trim()),
  };
}

export function effectiveCategorySeo(category) {
  const description = (category.description || '').trim() || categorySeoDescription(category);
  return {
    title: withBrandSuffix(categorySeoTitle(category)),
    description: clampDescription(description),
    generatedDescription: !((category.description || '').trim()),
  };
}
