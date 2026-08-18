#!/usr/bin/env node
//
// Writes dist/sitemap.xml from the same route list the prerenderer uses.
//
// Run after `vite build`, from Frontend/:
//
//     VITE_API_URL=https://…/api/ node scripts/generate-sitemap.mjs
//
// No <lastmod>. The API does not expose an updated_at on products yet, and a
// fabricated date — today's, or the build's — teaches Google that the
// timestamp means nothing, which is worse than not having one.

import { writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchCategories, fetchProducts } from './lib/api.mjs';
import { buildRouteList, isDisallowed, readDisallowRules } from './lib/routes.mjs';

const FRONTEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(FRONTEND_DIR, 'dist');
const ROBOTS_PATH = join(FRONTEND_DIR, 'public', 'robots.txt');

const SITE_URL = (process.env.VITE_SITE_URL || 'https://www.pronounjeans.com').replace(/\/+$/, '');

const escapeXml = (value) => value.replace(/[<>&'"]/g, (ch) => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]
));

async function main() {
  const categories = await fetchCategories();
  const products = await fetchProducts(categories);
  const disallowRules = await readDisallowRules(ROBOTS_PATH);

  const excluded = [];
  const included = buildRouteList({ categories, products }).filter((route) => {
    if (!route.indexable) {
      excluded.push(`${route.path} (noindex)`);
      return false;
    }
    if (isDisallowed(route.path, disallowRules)) {
      excluded.push(`${route.path} (robots.txt)`);
      return false;
    }
    return true;
  });

  const body = included
    .map((route) => `  <url>\n    <loc>${escapeXml(`${SITE_URL}${route.path === '/' ? '/' : route.path}`)}</loc>\n  </url>`)
    .join('\n');

  await writeFile(
    join(DIST_DIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    'utf8',
  );

  console.log(`✓ sitemap.xml — ${included.length} URLs (${excluded.length} excluded)`);
  for (const entry of excluded) console.log(`    - ${entry}`);
}

main().catch((err) => {
  console.error(`\n✗ Sitemap generation failed: ${err.message}`);
  process.exit(1);
});
