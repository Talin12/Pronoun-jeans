// Shared plumbing for the two crawler-facing functions (sitemap.js, render.js).
// Files under api/_lib are not deployed as routes — the leading underscore
// tells Vercel this is a helper, not an endpoint.

export const SITE_URL = (process.env.VITE_SITE_URL || 'https://www.pronounjeans.com')
  .trim()
  .replace(/\/+$/, '');

// The storefront's own API base when it is absolute; otherwise the production
// Render service. A relative VITE_API_URL ("/api/") only makes sense in a
// browser behind the dev proxy, never from a server function.
const configured = (process.env.SEO_API_URL || process.env.VITE_API_URL || '').trim();
export const API_URL = (/^https?:\/\//.test(configured)
  ? configured
  : 'https://pronoun-jeans.onrender.com/api/').replace(/\/?$/, '/');

const TIMEOUT_MS = 8000;

/**
 * GET a public API path as JSON. Anonymous on purpose: the anonymous payload
 * has b2b_price / set_price nulled by the API, so nothing fetched here can
 * leak wholesale rates into public HTML. Returns null on 404; throws on any
 * other failure so the caller can fall back to the plain shell.
 */
export async function apiGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : data;
  } finally {
    clearTimeout(timer);
  }
}

/** Products a visitor can actually open — the same filter the API applies. */
export async function listProducts(params = '') {
  const data = await apiGet(`products/catalog/${params ? `?${params}` : ''}`);
  return Array.isArray(data) ? data : [];
}

/** Top-level categories (sub-categories have no page of their own). */
export async function listCategories() {
  const data = await apiGet('products/categories/');
  return Array.isArray(data) ? data : [];
}

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const absoluteUrl = (path = '/') => {
  const clean = path === '/' ? '/' : `/${String(path).replace(/^\/+|\/+$/g, '')}`;
  return `${SITE_URL}${clean}`;
};
