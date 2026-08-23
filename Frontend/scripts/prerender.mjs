#!/usr/bin/env node
//
// Turns the built SPA into real HTML.
//
// index.html ships an empty <div id="root">, so before this step every URL on
// the site served the same blank shell to anything that does not run
// JavaScript. This walks every public route in a headless browser and writes
// what the browser ended up with to dist/<route>/index.html.
//
// Run after `vite build`, from Frontend/:
//
//     VITE_API_URL=https://…/api/ node scripts/prerender.mjs
//
// The pages still boot the SPA on load. React mounts with createRoot, not
// hydrateRoot, so it replaces the snapshot outright rather than trying to
// reconcile with it — there is no hydration to mismatch. The snapshot is for
// crawlers and first paint; the app takes over a moment later.
//
// Nothing is logged in at build time (a fresh profile, empty localStorage), so
// the logged-out Navbar and an empty cart are what get baked in. That is
// asserted below rather than assumed.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchCategories, fetchProducts } from './lib/api.mjs';
import { buildRouteList } from './lib/routes.mjs';
import { launchBrowser } from './lib/browser.mjs';
import { startStaticServer } from './lib/static-server.mjs';

const FRONTEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(FRONTEND_DIR, 'dist');

// The rewrites in vercel.json fall back to this for any path without its own
// prerendered file — a product added since the last deploy, or a private page
// that is deliberately not prerendered. It has to stay the *bare* shell:
// pointing those rewrites at the prerendered homepage would serve homepage
// copy, and a homepage canonical, on a product URL.
const SHELL_FILENAME = 'app.html';

// A path that cannot match a route, used to snapshot the 404 page.
const NOT_FOUND_PROBE = '/__prerender_404__';

/** '/catalog/cargo-pant' -> 'dist/catalog/cargo-pant/index.html' */
function outputPathFor(routePath) {
  if (routePath === '/') return join(DIST_DIR, 'index.html');
  return join(DIST_DIR, routePath.replace(/^\//, ''), 'index.html');
}

async function writeHtml(filePath, html) {
  await mkdir(dirname(filePath), { recursive: true });
  // outerHTML has no doctype; without it browsers fall into quirks mode.
  await writeFile(filePath, `<!doctype html>\n${html}`, 'utf8');
}

/**
 * Everything that makes a captured page unfit to ship.
 *
 * A silent partial prerender is worse than none: a page that captured its
 * loading spinner, or one carrying somebody's session, would look fine in the
 * build log and be wrong for as long as the deploy lives.
 */
function validate({ html, errors, rootFilled }) {
  const problems = [];

  const fatal = errors.filter((e) => e.fatal);
  if (fatal.length) problems.push(`uncaught page error: ${fatal[0].text}`);

  if (!rootFilled) problems.push('#root is empty — the app rendered nothing');

  if (!/<title>[^<]+<\/title>/.test(html)) problems.push('no non-empty <title>');

  // Auth-dependent chrome must never be baked in. These strings only appear in
  // Navbar's signed-in branch.
  if (html.includes('Logged in as')) problems.push('signed-in Navbar was captured');
  if (html.includes('ORDERING ON BEHALF OF')) problems.push('agent impersonation banner was captured');

  return problems;
}

async function main() {
  const startedAt = Date.now();

  console.log('› Reading the live catalogue');
  const categories = await fetchCategories();
  const products = await fetchProducts(categories);
  console.log(`  ${categories.length} categories, ${products.length} products`);

  const routes = buildRouteList({ categories, products });

  // Captured before anything is written, and written out as the fallback shell.
  const shellHtml = await readFile(join(DIST_DIR, 'index.html'), 'utf8');
  await writeFile(join(DIST_DIR, SHELL_FILENAME), shellHtml, 'utf8');

  const server = await startStaticServer({ distDir: DIST_DIR, shellHtml });
  const browser = await launchBrowser();
  console.log(`› Browser: ${browser.name}`);
  console.log(`› Prerendering ${routes.length + 1} routes from ${server.origin}`);

  const failures = [];
  const warnings = [];

  try {
    for (const [index, route] of [...routes, { path: NOT_FOUND_PROBE }].entries()) {
      const isNotFoundProbe = route.path === NOT_FOUND_PROBE;
      const label = `[${String(index + 1).padStart(3)}/${routes.length + 1}] ${isNotFoundProbe ? '404' : route.path}`;

      let captured;
      try {
        captured = await browser.capture(`${server.origin}${route.path}`);
      } catch (err) {
        failures.push(`${route.path}: ${err.message}`);
        console.error(`  ✗ ${label} — ${err.message}`);
        continue;
      }

      const problems = validate(captured);
      if (problems.length) {
        failures.push(`${route.path}: ${problems.join('; ')}`);
        console.error(`  ✗ ${label} — ${problems.join('; ')}`);
        continue;
      }

      for (const err of captured.errors.filter((e) => !e.fatal)) {
        warnings.push(`${route.path}: ${err.text}`);
      }

      await writeHtml(
        isNotFoundProbe ? join(DIST_DIR, '404.html') : outputPathFor(route.path),
        captured.html,
      );
      console.log(`  ✓ ${label}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (warnings.length) {
    console.warn(`\n! ${warnings.length} console error(s) during prerender:`);
    for (const warning of warnings.slice(0, 20)) console.warn(`    ${warning}`);
  }

  if (failures.length) {
    console.error(`\n✗ Prerender failed on ${failures.length} of ${routes.length + 1} routes:`);
    for (const failure of failures) console.error(`    ${failure}`);
    process.exitCode = 1;
    throw new Error('Prerender incomplete — refusing to ship a half-static site.');
  }

  console.log(`\n✓ Prerendered ${routes.length + 1} routes in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
