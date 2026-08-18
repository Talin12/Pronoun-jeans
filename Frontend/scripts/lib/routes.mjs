// The single definition of "which URLs this build is responsible for",
// shared by the prerenderer and the sitemap so the two cannot drift.

import { readFile } from 'node:fs/promises';

/**
 * Static routes that are prerendered.
 *
 * Missing on purpose: /login, /cart, /history, /dashboard, /reset-password/*
 * and both portals. They are noindex, they are behind auth, or both — there is
 * no crawler to serve and no first-paint worth the build time. They keep
 * falling through to the SPA shell via the rewrites in vercel.json.
 */
export const STATIC_ROUTES = [
  { path: '/', indexable: true },
  { path: '/catalog', indexable: true },
  { path: '/about', indexable: true },
  { path: '/contact', indexable: true },
  // Prerendered for the reader, kept out of the sitemap: these carry
  // <meta name="robots" content="noindex">, and submitting a noindex URL in a
  // sitemap is a contradiction Search Console reports as an error.
  { path: '/terms', indexable: false },
  { path: '/privacy', indexable: false },
  { path: '/refund', indexable: false },
];

/** Parse the Disallow rules out of public/robots.txt. */
export async function readDisallowRules(robotsPath) {
  const text = await readFile(robotsPath, 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^disallow:/i.test(line))
    .map((line) => line.slice('disallow:'.length).trim())
    .filter(Boolean);
}

/**
 * Does `path` fall under a robots.txt Disallow rule?
 *
 * robots.txt matching is prefix-based, with `*` as a wildcard — enough of the
 * grammar to evaluate the rules this site actually has, including
 * `/*?subcategory=`.
 */
export function isDisallowed(path, rules) {
  return rules.some((rule) => {
    const pattern = rule
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\$$/, '$');
    return new RegExp(`^${pattern}`).test(path);
  });
}

/** Every route this build should produce HTML for, in a stable order. */
export function buildRouteList({ categories, products }) {
  return [
    ...STATIC_ROUTES,
    ...categories.map((c) => ({ path: `/catalog/${c.slug}`, indexable: true })),
    ...products.map((p) => ({ path: `/product/${p.slug}`, indexable: true })),
  ];
}
