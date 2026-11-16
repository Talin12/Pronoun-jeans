// Server-rendered HTML for the pages search engines need to read:
//   /                 → page=home
//   /catalog          → page=catalog
//   /catalog/:slug    → page=category
//   /product/:slug    → page=product
//   /about            → page=about
//   /contact          → page=contact
// (wired up by the rewrites in vercel.json).
//
// Why this exists: the storefront is a client-rendered SPA, so the HTML a
// crawler first receives had an empty <div id="root"> — no H1, no product
// text, one generic title for every URL. This function takes the built SPA
// shell, fills <head> with the page's real title/description/canonical and
// fills #root with real, readable content (H1, copy, product and category
// links), then sends it. React boots on top exactly as before and replaces
// #root with the interactive page.
//
// Deliberately NOT a prerender: no headless browser, nothing at build time.
// It is plain string templating over the public API, cached at Vercel's edge.
//
// Anything rendered here must also be on the React page (same copy, from
// src/content/seoContent.js) — the server HTML is a faithful preview of the
// page, never content only crawlers see.

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  SITE_URL, absoluteUrl, apiGet, escapeHtml as esc, listCategories, listProducts,
} from './_lib/catalog.js';
import {
  BRAND, BUSINESS, ADDRESS_LINES, SITE_DESCRIPTION, HOME_HEADING, HOME_TITLE, HOME_INTRO, HOME_ABOUT, HOME_FAQS,
  CATALOG_TITLE, CATALOG_DESCRIPTION,
  ABOUT_TITLE, ABOUT_DESCRIPTION, ABOUT_HEADING, ABOUT_HEADING_ACCENT, ABOUT_LEAD, ABOUT_STORY,
  ABOUT_WHO_HEADING, ABOUT_WHO, ABOUT_VALUES,
  CONTACT_TITLE, CONTACT_DESCRIPTION, CONTACT_HEADING, CONTACT_INTRO,
  categoryContent, faqSchema, moqLabel, piecesLabel, sizeRanges, plainText,
  withBrandSuffix, clampDescription,
  productSeoTitle, productSeoDescription, categorySeoTitle, categorySeoDescription,
} from '../src/content/seoContent.js';

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

// ── The SPA shell ───────────────────────────────────────────────────────────
//
// vite.config.js emits the built index.html as dist/app.html (so that "/" is
// not a static file and reaches this function). vercel.json ships that file
// inside this function's own bundle (functions → includeFiles), so the shell
// is normally read straight off the local filesystem — the same path used
// under `vercel dev`.
//
// The network fetch is the fallback, and it is only trusted briefly. The
// earlier reasoning here — the function is per-deploy, so its cached shell
// cannot go stale — missed that the fetch goes through the public CDN, which
// for a short window after a deploy still answers with the *previous*
// deploy's /app. That shell names asset bundles this deployment no longer
// serves, so the SSR text renders and then React never boots because its
// <script> 404s. Caching it for the life of the instance made that outage
// permanent; a short TTL lets the next request heal it.

const NETWORK_SHELL_TTL_MS = 60_000;

let shellPromise = null;
let shellExpires = 0;

async function loadShell(origin) {
  const candidates = [
    path.join(process.cwd(), 'dist', 'app.html'),
    path.join(process.cwd(), 'app.html'),
  ];
  for (const file of candidates) {
    // Local: this deployment's own shell, so it can be kept indefinitely.
    try { return { html: await fs.readFile(file, 'utf8'), ttl: Infinity }; } catch { /* try the next */ }
  }
  // Preview deployments sit behind Vercel Authentication; the automation
  // bypass secret (when configured) lets the function read its own shell.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  // `/app` (cleanUrls form of app.html). In production read it from the
  // public domain: the forwarded host there can be the *.vercel.app
  // deployment URL, which sits behind Vercel Authentication and answers with
  // a login page instead of the shell.
  const base = process.env.VERCEL_ENV === 'production' ? SITE_URL : origin;
  const res = await fetch(`${base}/app`, {
    redirect: 'follow',
    headers: bypass ? { 'x-vercel-protection-bypass': bypass } : {},
  });
  if (!res.ok) throw new Error(`shell fetch → ${res.status}`);
  const html = await res.text();
  if (!/<div id="root">\s*<\/div>/.test(html)) throw new Error('shell fetch returned something other than the app shell');
  return { html, ttl: NETWORK_SHELL_TTL_MS };
}

function getShell(origin) {
  if (!shellPromise || Date.now() >= shellExpires) {
    // Set provisionally before awaiting, so concurrent requests on a cold
    // instance share one load instead of starting a fetch each.
    shellExpires = Date.now() + NETWORK_SHELL_TTL_MS;
    shellPromise = loadShell(origin)
      .then(({ html, ttl }) => {
        shellExpires = ttl === Infinity ? Infinity : Date.now() + ttl;
        return html;
      })
      .catch((err) => { shellPromise = null; shellExpires = 0; throw err; });
  }
  return shellPromise;
}

// ── HTML helpers ────────────────────────────────────────────────────────────

const jsonForScript = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

const bootstrap = (key, data) =>
  `<script type="application/json" data-bootstrap="${esc(key)}">${jsonForScript(data)}</script>`;

// Every head tag carries data-default-meta, which <Seo> removes on mount
// before adding its own — so the server tags and React's never coexist.
function headTags({ title, description, canonical, image, type = 'website', noindex = false, jsonLd = [] }) {
  const t = esc(title);
  const d = esc(description);
  const u = esc(canonical);
  const img = esc(image || DEFAULT_OG_IMAGE);
  return [
    `<title data-default-meta>${t}</title>`,
    `<meta data-default-meta name="description" content="${d}" />`,
    `<link data-default-meta rel="canonical" href="${u}" />`,
    noindex && '<meta data-default-meta name="robots" content="noindex, nofollow" />',
    `<meta data-default-meta property="og:type" content="${esc(type)}" />`,
    `<meta data-default-meta property="og:site_name" content="${esc(BRAND)}" />`,
    `<meta data-default-meta property="og:title" content="${t}" />`,
    `<meta data-default-meta property="og:description" content="${d}" />`,
    `<meta data-default-meta property="og:url" content="${u}" />`,
    `<meta data-default-meta property="og:image" content="${img}" />`,
    '<meta data-default-meta property="og:locale" content="en_IN" />',
    '<meta data-default-meta name="twitter:card" content="summary_large_image" />',
    `<meta data-default-meta name="twitter:title" content="${t}" />`,
    `<meta data-default-meta name="twitter:description" content="${d}" />`,
    `<meta data-default-meta name="twitter:image" content="${img}" />`,
    ...jsonLd.map((data) =>
      `<script data-default-meta type="application/ld+json">${jsonForScript(data)}</script>`),
  ].filter(Boolean).join('\n    ');
}

const DEFAULT_TAG = /<(title|meta|link)\b[^>]*\bdata-default-meta\b[^>]*>(?:[^<]*<\/title>)?\s*/gi;

// The replacements are passed as functions, not strings: in a replacement
// string `$$`, `$&`, `` $` `` and `$1` are special, so JSON-LD carrying
// priceRange "$$" arrived as "$", and a product name holding `$&` would paste
// the matched tag — or the whole document before it — into the page.
function assemble(shell, { head, body, data = '' }) {
  return shell
    .replace(DEFAULT_TAG, '')
    .replace('</head>', () => `    ${head}\n  </head>`)
    .replace(/<div id="root">\s*<\/div>/, () => `<div id="root">${data}<div class="ssr">${body}</div></div>`);
}

// Readable without JavaScript, and close enough to the real layout that the
// hand-over to React is not a jolt. Scoped to .ssr so it cannot leak.
const SSR_STYLE = `<style>
.ssr{max-width:72rem;margin:0 auto;padding:2rem 1.25rem;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#18181b;line-height:1.6}
.ssr nav{font-size:.85rem;margin-bottom:1rem}.ssr nav a{color:#dc2626;margin-right:.75rem}
.ssr h1{font-size:2rem;font-weight:800;line-height:1.2;margin:.25rem 0 .75rem}
.ssr h2{font-size:1.35rem;font-weight:800;margin:2rem 0 .75rem}.ssr h3{font-size:1rem;font-weight:700;margin:1rem 0 .25rem}
.ssr p{margin:.5rem 0;max-width:48rem;color:#3f3f46}.ssr a{color:inherit}
.ssr ul.grid{list-style:none;padding:0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))}
.ssr ul.grid img{width:100%;height:12rem;object-fit:cover;border-radius:.75rem;background:#f4f4f5}
.ssr ul.grid a{display:block;text-decoration:none;font-weight:600}
.ssr .hero-img{max-width:28rem;width:100%;border-radius:1rem}
.ssr dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}.ssr dt{font-weight:700}
@media (prefers-color-scheme:dark){.ssr{color:#f4f4f5}.ssr p{color:#a1a1aa}}
</style>`;

const crumbs = (items) => `<nav aria-label="Breadcrumb">${items
  .map(({ name, path: p }) => `<a href="${esc(p)}">${esc(name)}</a>`).join(' › ')}</nav>`;

const breadcrumbSchema = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem', position: i + 1, name: item.name, item: absoluteUrl(item.path),
  })),
});

const faqBlock = (faqs) => faqs.length ? `
  <section><h2>Frequently asked questions</h2>
  ${faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('\n  ')}
  </section>` : '';

const productCard = (p) => `<li><a href="/product/${esc(p.slug)}">${p.image
  ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" width="400" height="400" />` : ''}
  <span>${esc(p.name)}</span></a></li>`;

const categoryCard = (c) => `<li><a href="/catalog/${esc(c.slug)}">${c.image
  ? `<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" width="400" height="300" />` : ''}
  <span>${esc(c.name)}</span></a></li>`;

const paragraphs = (list) => list.map((p) => `<p>${esc(p)}</p>`).join('\n  ');

// Mirrors CategoryProducts.jsx's forBootstrap: just what a card renders.
const cardData = (products) => products.map((p) => ({
  id: p.id, slug: p.slug, name: p.name, image: p.image,
  category_name: p.category_name, moq: p.moq,
  variations: (p.variations ?? []).map((v) => ({ id: v.id, pieces: v.pieces, size: v.size })),
}));

// ── Pages ───────────────────────────────────────────────────────────────────

async function homePage() {
  const [categories, products, slides] = await Promise.all([
    listCategories(), listProducts(), apiGet('products/hero-slides/').catch(() => []),
  ]);
  const shown = categories.slice(0, 6);
  return {
    head: headTags({
      title: withBrandSuffix(HOME_TITLE),
      description: clampDescription(SITE_DESCRIPTION),
      canonical: absoluteUrl('/'),
      jsonLd: [faqSchema(HOME_FAQS)],
    }),
    data: bootstrap('home', { slides: Array.isArray(slides) ? slides : [], categories: shown }),
    body: `
  <h1>${esc(HOME_HEADING)}</h1>
  <p>${esc(HOME_INTRO)}</p>
  <h2>Shop by category</h2>
  <ul class="grid">${categories.map(categoryCard).join('')}</ul>
  <h2>About Pronoun Jeans</h2>
  ${paragraphs(HOME_ABOUT)}
  <h2>Latest wholesale styles</h2>
  <ul class="grid">${products.slice(0, 12).map(productCard).join('')}</ul>
  ${faqBlock(HOME_FAQS)}`,
  };
}

async function catalogPage() {
  const [categories, products] = await Promise.all([listCategories(), listProducts()]);
  const items = [{ name: 'Home', path: '/' }, { name: 'Catalogue', path: '/catalog' }];
  return {
    head: headTags({
      title: withBrandSuffix(CATALOG_TITLE),
      description: clampDescription(CATALOG_DESCRIPTION),
      canonical: absoluteUrl('/catalog'),
      jsonLd: [breadcrumbSchema(items)],
    }),
    data: bootstrap('catalog', { categories }),
    body: `
  ${crumbs(items)}
  <h1>Wholesale Men's Bottom-wear Catalogue</h1>
  <p>${esc(CATALOG_DESCRIPTION)}</p>
  ${categories.map((c) => {
    const inCat = products.filter((p) => p.category === c.id || p.category_name === c.name);
    return `<section>
    <h2><a href="/catalog/${esc(c.slug)}">${esc(c.name)}</a></h2>
    <p>${esc(categoryContent(c).paragraphs[0])}</p>
    ${inCat.length ? `<ul>${inCat.map((p) => `<li><a href="/product/${esc(p.slug)}">${esc(p.name)}</a></li>`).join('')}</ul>` : ''}
  </section>`;
  }).join('\n  ')}`,
  };
}

async function categoryPage(slug) {
  const category = await apiGet(`products/categories/${encodeURIComponent(slug)}/`);
  if (!category) return null;
  const products = await listProducts(`category=${encodeURIComponent(slug)}`);
  const copy = categoryContent(category);
  const items = [
    { name: 'Home', path: '/' },
    { name: 'Catalogue', path: '/catalog' },
    { name: category.name, path: `/catalog/${category.slug}` },
  ];
  return {
    head: headTags({
      title: withBrandSuffix(categorySeoTitle(category)),
      description: clampDescription((category.description || '').trim() || categorySeoDescription(category)),
      canonical: absoluteUrl(`/catalog/${category.slug}`),
      image: category.image,
      jsonLd: [breadcrumbSchema(items), faqSchema(copy.faqs)],
    }),
    data: bootstrap(`category:${slug}`, {
      name: category.name,
      description: category.description || '',
      content: category.content || '',
      faqs: category.faqs || [],
      subcategories: category.subcategories || [],
      products: cardData(products),
    }),
    body: `
  ${crumbs(items)}
  <h1>${esc(category.name)}</h1>
  <p>${products.length} product${products.length === 1 ? '' : 's'} available</p>
  <ul class="grid">${products.map(productCard).join('')}</ul>
  <section>
  <h2>${esc(copy.heading)}</h2>
  ${paragraphs(copy.paragraphs)}
  </section>
  ${faqBlock(copy.faqs)}`,
  };
}

async function productPage(slug) {
  const [product, categories] = await Promise.all([
    apiGet(`products/catalog/${encodeURIComponent(slug)}/`),
    listCategories().catch(() => []),
  ]);
  if (!product) return null;

  const title = withBrandSuffix((product.meta_title || '').trim() || productSeoTitle(product));
  const description = clampDescription((product.meta_description || '').trim() || productSeoDescription(product));
  const categorySlug = categories.find((c) => c.id === product.category)?.slug;
  const items = [
    { name: 'Home', path: '/' },
    { name: 'Catalogue', path: '/catalog' },
    ...(product.category_name
      ? [{ name: product.category_name, path: categorySlug ? `/catalog/${categorySlug}` : '/catalog' }]
      : []),
    { name: product.name, path: `/product/${product.slug}` },
  ];

  const descriptionText = plainText(product.description).split('\n\n');
  const fabricText = plainText(product.fabric_details).split('\n\n');
  const colours = [...new Set((product.variations ?? []).map((v) => v.color_name || v.color).filter((c) => c && c !== 'Default'))];
  const ranges = sizeRanges(product);
  const pcs = piecesLabel(product);
  const specs = [
    ...(product.attributes ?? []).map((a) => [a.name, a.values.join(', ')]),
    ranges.length && ['Size sets', ranges.join(', ')],
    pcs && ['Pieces per set', pcs],
    ['Minimum order', moqLabel(product)],
    colours.length && ['Colours', colours.join(', ')],
  ].filter(Boolean);

  return {
    head: headTags({
      title, description,
      canonical: absoluteUrl(`/product/${product.slug}`),
      image: product.og_image || product.image,
      type: 'product',
    }),
    body: `
  ${crumbs(items)}
  ${product.image ? `<img class="hero-img" src="${esc(product.image)}" alt="${esc(product.name)}" width="600" height="600" />` : ''}
  <h1>${esc(product.name)}</h1>
  ${product.category_name ? `<p>Wholesale ${esc(product.category_name)} by ${esc(BRAND)}, Ahmedabad</p>` : ''}
  <dl>${specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  ${descriptionText.filter(Boolean).length ? `<h2>Product details</h2>\n  ${paragraphs(descriptionText.filter(Boolean))}` : ''}
  ${fabricText.filter(Boolean).length ? `<h2>Fabric</h2>\n  ${paragraphs(fabricText.filter(Boolean))}` : ''}
  <p>Wholesale prices are shown to verified B2B buyers after signing in.</p>`,
  };
}

function aboutPage() {
  const items = [{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }];
  return {
    head: headTags({
      title: withBrandSuffix(ABOUT_TITLE),
      description: clampDescription(ABOUT_DESCRIPTION),
      canonical: absoluteUrl('/about'),
      jsonLd: [breadcrumbSchema(items)],
    }),
    body: `
  ${crumbs(items)}
  <h1>${esc(ABOUT_HEADING)} ${esc(ABOUT_HEADING_ACCENT)}</h1>
  <p>${esc(ABOUT_LEAD)}</p>
  <p>${esc(ABOUT_STORY)}</p>
  <h2>${esc(ABOUT_WHO_HEADING)}</h2>
  ${paragraphs(ABOUT_WHO)}
  <h2>What We Stand For</h2>
  ${ABOUT_VALUES.map((v) => `<h3>${esc(v.title)}</h3><p>${esc(v.body)}</p>`).join('\n  ')}
  <h2>Ready to stock PRO-NOUN?</h2>
  <p>Join our network of wholesale partners across India. <a href="/catalog">Browse the wholesale catalogue</a> or <a href="/contact">contact us</a>.</p>`,
  };
}

function contactPage() {
  const items = [{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }];
  return {
    head: headTags({
      title: withBrandSuffix(CONTACT_TITLE),
      description: clampDescription(CONTACT_DESCRIPTION),
      canonical: absoluteUrl('/contact'),
      jsonLd: [breadcrumbSchema(items), contactSchema()],
    }),
    body: `
  ${crumbs(items)}
  <h1>${esc(CONTACT_HEADING)}</h1>
  <p>${esc(CONTACT_INTRO)}</p>
  <h2>Our Details</h2>
  <address>
  <p><a href="${esc(BUSINESS.mapUrl)}">${ADDRESS_LINES.map(esc).join('<br />')}</a></p>
  <p>Phone: <a href="tel:${esc(BUSINESS.phoneE164)}">${esc(BUSINESS.phone)}</a></p>
  <p>WhatsApp: <a href="${esc(BUSINESS.whatsapp)}">${esc(BUSINESS.phone)}</a></p>
  <p>Email: <a href="mailto:${esc(BUSINESS.email)}">${esc(BUSINESS.email)}</a></p>
  </address>
  <h2>Business Hours</h2>
  <p>${esc(BUSINESS.hoursLabel)}</p>
  <p>${esc(BUSINESS.closedLabel)}</p>`,
  };
}

// Mirrors contactLocalBusinessSchema() in src/config/schema.js (which cannot
// be imported here: it pulls in import.meta via config/site.js).
function contactSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_URL}/#localbusiness`,
    name: BRAND,
    legalName: BUSINESS.legalName,
    url: `${SITE_URL}/`,
    image: DEFAULT_OG_IMAGE,
    telephone: BUSINESS.phoneSchema,
    email: BUSINESS.email,
    priceRange: '$$',
    parentOrganization: { '@id': `${SITE_URL}/#organization` },
    address: {
      '@type': 'PostalAddress',
      streetAddress: BUSINESS.streetAddress,
      addressLocality: BUSINESS.locality,
      addressRegion: BUSINESS.region,
      postalCode: BUSINESS.postalCode,
      addressCountry: BUSINESS.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: BUSINESS.latitude, longitude: BUSINESS.longitude },
    areaServed: { '@type': 'Country', name: 'IN' },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '10:00',
      closes: '18:30',
    }],
    hasMap: BUSINESS.mapUrl,
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────

const PAGES = {
  home: homePage, catalog: catalogPage, category: categoryPage, product: productPage,
  about: aboutPage, contact: contactPage,
};

export default async function handler(req, res) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `${proto}://${host}`;
  const { page = 'home', slug = '' } = req.query ?? {};

  let shell;
  try {
    shell = await getShell(origin);
  } catch (err) {
    console.error('[render] no shell:', err);
    return res.status(500).send('Temporarily unavailable');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const render = PAGES[page];
  let result;
  try {
    result = render ? await render(String(slug)) : null;
  } catch (err) {
    // The API is down or slow: serve the plain SPA shell, which still works
    // for people, and do not let the edge cache the degraded copy.
    console.error(`[render] ${page}/${slug} failed:`, err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(shell);
  }

  if (!result) {
    // Unknown category or product slug: a real 404 status (not a soft 404),
    // with the SPA still booting so the visitor sees the NotFound page.
    const html = assemble(shell, {
      head: headTags({
        title: withBrandSuffix('Page not found'),
        description: clampDescription(SITE_DESCRIPTION),
        canonical: absoluteUrl(page === 'product' ? `/product/${slug}` : `/catalog/${slug}`),
        noindex: true,
      }),
      body: '<h1>Page not found</h1><p><a href="/catalog">Browse the catalogue</a></p>',
    });
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return res.status(404).send(html);
  }

  const html = assemble(shell, {
    head: `${result.head}
    ${SSR_STYLE}`,
    body: result.body,
    data: result.data,
  });
  // Ten minutes fresh at the edge, then served stale while it refreshes —
  // crawlers and visitors never wait on a cold API.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  return res.status(200).send(html);
}
