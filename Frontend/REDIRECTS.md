# Redirect and rewrite map

Everything here lives in `Frontend/vercel.json`. JSON forbids comments, so this
file is the documentation for it. Keep the two in step.

---

## ⚠️ Adding a new public route? Add it here too.

`vercel.json` no longer rewrites everything to `/`. It carries an **explicit
allowlist** of paths that fall through to the SPA. Anything not on that list
gets Vercel's real 404 — which is the point, so that genuine 404s stop
returning HTTP 200.

The consequence: **a new `<Route>` in `src/App.jsx` that is not added to the
`rewrites` array in `vercel.json` will 404 on direct load or refresh.** It will
still work when reached by clicking inside the app, so this breaks silently and
only for people arriving from a link, a bookmark, or a search result.

Every route in `App.jsx` was checked against the allowlist when this was
written. Nested routes are covered by their parent's `:path*` — `/admin/:path*`
covers all eleven admin children, `/agent/:path*` all five agent children.

---

## Rewrites now fall back to `/app.html`, not `/index.html`

`npm run build` prerenders every public route to its own file —
`dist/catalog/shorts/index.html` and so on — and `dist/index.html` is the
prerendered **homepage**, not a blank shell any more.

Vercel checks the filesystem before it applies rewrites, so those files win and
the rewrites below only ever fire for paths that have no prerendered file.
Pointing them at `/index.html` would therefore serve homepage copy, and a
homepage canonical, on some other URL. `scripts/prerender.mjs` keeps a copy of
the bare shell at `dist/app.html` for exactly this, and every rewrite targets
it.

`/app` is `Disallow`ed in `robots.txt` and carries `X-Robots-Tag: noindex,
nofollow`, so the shell cannot be indexed in its own right.

---

## `/catalog/:path*` and `/product/:path*` are deliberately NOT rewritten

Every real category and product is prerendered, so a path under those prefixes
with no file on disk is not a page — and it now gets a real 404 instead of the
SPA shell and an HTTP 200. That is the whole point of the allowlist, applied to
the two prefixes that used to be blanket wildcards.

**The trade:** a product added in the admin panel 404s until the site
rebuilds. `Backend/products/signals.py` fires a Vercel deploy hook on save, so
the window is one build (~6 minutes), not until someone notices — but it is not
zero. If that ever becomes unacceptable, restoring

```json
{ "source": "/product/:path*", "destination": "/app.html" }
```

brings back client-side rendering for unknown slugs, at the cost of soft-404s
(HTTP 200 + a "not found" page) on every mistyped or retired URL.

---

## Why this exists

`vercel.json` used to be a single catch-all:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
```

Every URL on the domain returned HTTP 200 and the homepage shell. Two
consequences, both bad for search:

1. The whole legacy WooCommerce URL surface — still in Google's index after the
   migration — served the homepage instead of redirecting anywhere useful.
2. Genuine 404s returned 200, so Google kept crawling and indexing URLs that no
   longer exist.

## Status of this map

**First pass.** The legacy rules are derived from standard WooCommerce URL
patterns, not from a record of what this site actually published.

**It should be reconciled against a Google Search Console → Pages export** (or
the original WooCommerce export CSV) before being treated as complete. Old URLs
that neither pattern below covers still 404 silently.

---

## Legacy → new

| Old (WooCommerce)              | New                | Code |
| ------------------------------ | ------------------ | ---- |
| `/shop`, `/shop/*`             | `/catalog`         | 301  |
| `/product-category/<slug>`     | `/catalog/<slug>`  | 301  |
| `/product-category/*` (other)  | `/catalog`         | 301  |
| `/brand`, `/brand/*`           | `/catalog`         | 301  |
| `/product-tag`, `/product-tag/*` | `/catalog`       | 301  |
| `/my-account`, `/my-account/*` | `/login`           | 301  |
| `/checkout`, `/checkout/*`     | `/cart`            | 301  |
| `/basket`, `/basket/*`         | `/cart`            | 301  |
| `/wp-admin`, `/wp-admin/*`     | `/`                | 301  |
| `/wp-login.php`                | `/`                | 301  |
| `/wp-content/*`, `/wp-includes/*` | `/`             | 301  |
| `/xmlrpc.php`                  | `/`                | 301  |
| `/feed`, `/comments/feed`      | `/`                | 301  |

`/product/<slug>` is deliberately absent — the new app uses that same path, so
those URLs already resolve.

The wp-* rules would ideally be **410 Gone** rather than 301, since nothing
replaced them. Vercel's `redirects` cannot return a 4xx, so they are 301s to
the homepage. Revisit if these ever show up as a crawl-budget problem.

### Category slugs are pinned, not patterned

`/product-category/<slug>` is **not** a blanket pattern. The live category
slugs were checked against the API, and only those that actually resolve get a
one-to-one redirect:

`boxers`, `travel-wear-pant`, `cargo-pant`, `shorts`, `formal-pants`,
`co-ord-set`, `cotton-trousers`

Anything else under `/product-category/` goes to `/catalog`, the collections
index.

The reason: `/catalog/<unknown-slug>` renders "No products found in this
category" with an HTTP 200 — a soft 404. Redirecting an old URL into that is
worse than not redirecting it, because Google sees a 200 and keeps the URL.
Sub-category slugs behave the same way: they 404 on
`/api/products/categories/<slug>/` and are reachable only as
`/catalog/<parent>?subcategory=<sub>`, so they are not valid redirect targets
either.

**Unresolved:** no authoritative list of the *old* Woo category slugs exists in
this repo. `migrate_woo_data.py` reads a CSV passed via `--products`, and that
CSV is not committed. The current taxonomy looks entirely new — there is no
`jeans` category, for instance — so it is likely that few or none of the old
slugs match. Until a GSC Pages export is available, old category URLs land on
`/catalog` rather than a specific collection.

---

## Other behaviour

- **Canonical host** — the apex `pronounjeans.com` 301s to
  `www.pronounjeans.com`, which is the indexed hostname. If the Vercel
  dashboard already does this, the rule is redundant but harmless.
- **`cleanUrls: true`, `trailingSlash: false`** — one canonical form per URL.
  Trailing-slash variants of the legacy paths are normalised before matching,
  which is why `/product-category/jeans/` and `/product-category/jeans` both
  work from a single rule.
- **`/assets/*`** is served `Cache-Control: public, max-age=31536000, immutable`.
  Safe because Vite fingerprints those filenames.
- **`robots.txt`** is a real file in `public/`, so it is a filesystem match and
  is served before any rewrite is considered.
