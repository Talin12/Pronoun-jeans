// The generated titles and descriptions, in one place.
//
// These are used twice, and the two uses must agree: the storefront renders
// them when a product or category has no hand-written override, and the admin
// panel's Google preview shows what would be rendered. A preview built from a
// second, slightly different copy of the rules is worse than no preview — it
// would quietly tell the person writing the copy something untrue.

import {
  withBrandSuffix, clampDescription,
  productSeoTitle, productSeoDescription, categorySeoTitle, categorySeoDescription,
} from '../content/seoContent';

export { withBrandSuffix, productSeoTitle, productSeoDescription, categorySeoTitle, categorySeoDescription };

export const META_TITLE_MAX = 70;
export const META_DESCRIPTION_MAX = 160;

// The generators themselves live in content/seoContent.js, which has no
// browser or Vite dependencies, so the server render (api/render.js) builds
// exactly the same titles and descriptions as the pages and this preview.

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
