// /sitemap.xml (rewritten here by vercel.json).
//
// Built at request time from the live catalogue rather than at build time:
// the old build-time generator needed the API reachable during `vite build`
// and went away with the prerender step. Here a new product appears in the
// sitemap within the CDN cache window, with no deploy.
//
// Lists only public, indexable pages — home, catalogue, the static content
// pages, every top-level category and every active product. Cart, login,
// dashboards and admin are disallowed in robots.txt and deliberately absent.

import { SITE_URL, escapeHtml, listCategories, listProducts } from './_lib/catalog.js';
import { CONTENT_UPDATED } from '../src/content/seoContent.js';

// `lastmod` here is the date the page's copy was last edited, from
// CONTENT_UPDATED. Home and /catalog take theirs from the newest product
// instead, because their content is the catalogue. The two static content
// pages previously had no lastmod at all.
const STATIC_PAGES = [
  { path: '/',        changefreq: 'daily',   priority: '1.0' },
  { path: '/catalog', changefreq: 'daily',   priority: '0.9' },
  { path: '/about',   changefreq: 'monthly', priority: '0.5', lastmod: CONTENT_UPDATED.about },
  { path: '/contact', changefreq: 'monthly', priority: '0.5', lastmod: CONTENT_UPDATED.contact },
  // /terms, /privacy and /refund are deliberately absent: those pages carry
  // noindex, and listing a noindex URL in the sitemap is a contradiction
  // Search Console and Bing report as an error.
];

const day = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeHtml(loc)}</loc>`,
    lastmod && `    <lastmod>${lastmod}</lastmod>`,
    changefreq && `    <changefreq>${changefreq}</changefreq>`,
    priority && `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  let categories;
  let products;
  try {
    [categories, products] = await Promise.all([listCategories(), listProducts()]);
  } catch (err) {
    // A sitemap with only the static pages would tell Google every product
    // page vanished. A 503 tells it to come back later instead.
    console.error('[sitemap] API unavailable:', err);
    res.setHeader('Retry-After', '600');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('Sitemap temporarily unavailable');
  }

  const newest = [...products, ...categories]
    .map((x) => day(x.updated_at))
    .filter(Boolean)
    .sort()
    .pop();

  const entries = [
    ...STATIC_PAGES.map((p) => ({
      loc: `${SITE_URL}${p.path === '/' ? '/' : p.path}`,
      lastmod: p.lastmod ?? ((p.path === '/' || p.path === '/catalog') ? newest : null),
      changefreq: p.changefreq,
      priority: p.priority,
    })),
    ...categories.map((c) => ({
      loc: `${SITE_URL}/catalog/${c.slug}`,
      lastmod: day(c.updated_at),
      changefreq: 'weekly',
      priority: '0.8',
    })),
    ...products.map((p) => ({
      loc: `${SITE_URL}/product/${p.slug}`,
      lastmod: day(p.updated_at),
      changefreq: 'weekly',
      priority: '0.7',
    })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(urlEntry),
    '</urlset>',
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // An hour at the edge, then served stale for a day while it refreshes, so
  // Googlebot never waits on Render.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
