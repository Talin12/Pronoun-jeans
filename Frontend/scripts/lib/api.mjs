// Route sources for the prerenderer and the sitemap.
//
// Both need the same answer to "what pages exist right now", so they ask the
// live API the same way, once each, at build time.

const TIMEOUT_MS = 60_000;
const ATTEMPTS = 3;

export function apiBase() {
  const raw = (process.env.VITE_API_URL || '').trim();
  if (!raw) {
    throw new Error(
      'VITE_API_URL is not set. The prerenderer and sitemap read the live catalogue '
      + 'from it at build time; without it the build would silently produce a site '
      + 'with no product pages.',
    );
  }
  return raw.endsWith('/') ? raw : `${raw}/`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET one JSON document, retrying on transport errors and 5xx.
 *
 * The API sleeps on Render's free tier, so the first request of a build
 * routinely takes several seconds or times out outright. That is worth a
 * retry; a 404 or a 400 is not.
 */
async function getJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      if (res.status < 500) break;
    } catch (err) {
      lastError = err;
    }
    if (attempt < ATTEMPTS) await sleep(attempt * 3000);
  }
  throw lastError;
}

/**
 * Read a list endpoint whole.
 *
 * The API is unpaginated today (no DEFAULT_PAGINATION_CLASS), so these come
 * back as bare arrays — but DRF's paginated shape is one settings line away,
 * and a build that silently prerendered only the first page would be very hard
 * to notice. Both shapes are handled, and `next` is followed to the end.
 */
async function getList(url) {
  const collected = [];
  let next = url;
  const seen = new Set();
  while (next) {
    if (seen.has(next)) throw new Error(`Pagination loop at ${next}`);
    seen.add(next);
    const page = await getJson(next);
    if (Array.isArray(page)) {
      collected.push(...page);
      break;
    }
    collected.push(...(page.results ?? []));
    next = page.next ?? null;
  }
  return collected;
}

export async function fetchCategories() {
  const categories = await getList(`${apiBase()}products/categories/`);
  if (!categories.length) {
    throw new Error('The categories endpoint returned nothing — refusing to build a catalogue with no categories.');
  }
  return categories;
}

/**
 * Every active product, as the storefront can actually reach it.
 *
 * Enumerated per category rather than from the bare list endpoint, because
 * GET products/catalog/ with no query parameters currently returns HTTP 500
 * (it succeeds with ?category= or ?search=, so one un-serialisable row is
 * poisoning the unfiltered queryset — most likely a product whose category is
 * NULL, which ProductSerializer.category_name cannot traverse).
 *
 * Per-category enumeration is not a workaround so much as the honest
 * definition: a product with no category has no page a visitor can navigate
 * to. The bare list is still attempted afterwards, so that if it is ever
 * fixed, anything it turns up gets folded in rather than quietly missed.
 */
export async function fetchProducts(categories) {
  const bySlug = new Map();

  for (const category of categories) {
    const products = await getList(
      `${apiBase()}products/catalog/?category=${encodeURIComponent(category.slug)}`,
    );
    for (const product of products) {
      if (product?.slug) bySlug.set(product.slug, product);
    }
  }

  try {
    for (const product of await getList(`${apiBase()}products/catalog/`)) {
      if (product?.slug) bySlug.set(product.slug, product);
    }
  } catch (err) {
    console.warn(
      `  ! products/catalog/ (unfiltered) failed: ${err.message}\n`
      + '    Falling back to per-category enumeration only. Any product without a\n'
      + '    category is unreachable in the UI and will not be prerendered.',
    );
  }

  if (!bySlug.size) {
    throw new Error('No products found in any category — refusing to build a catalogue with no products.');
  }
  return [...bySlug.values()];
}
