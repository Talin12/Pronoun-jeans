# Centralised Media Library — Plan (Stack-Corrected for Pronoun Jeans)

> This supersedes the original generic prompt. It has been rewritten to match
> the **actual** stack: Django 6 + DRF, PostgreSQL, **Cloudinary** media storage,
> **Django admin (Jazzmin)** — *not* a React admin — and **no background job
> system**. Decisions already made by the owner are baked in below.

## Decisions locked in

| Topic | Decision | Rationale |
|---|---|---|
| Variant generation | **Use Cloudinary URL transforms** (`w_,f_auto,q_auto`). Do **not** pre-generate or store derivative files, and do **not** add a job queue. | Owner wants the admin to *feel faster*; Cloudinary already does responsive + AVIF/WebP on-the-fly. No Redis/Celery, no new infra cost on Render. |
| Media picker UI | **Django admin widget + vanilla JS**, matching existing `admin/js/*.js` conventions. No React, no backend build step. | Owner: "nothing should break." The React app is the *customer storefront*, not the admin. |
| Dedup hash | SHA-256 of the **final stored bytes** (after `CompressedImageField` re-encodes), not the raw upload. | `CompressedImageField` mutates bytes on upload; hashing the original would never dedup. |
| Polymorphism | String `attachable_type` + `attachable_id` (matches the `/api/:type/:id/media` shape). ContentType framework noted as alternative. | Keeps API routes clean; avoids coupling to `django_content_type` ids in URLs. |
| Product↔category | **Already many-to-many** (`Product.category` FK + `Product.subcategories` M2M). No prerequisite fix needed. | Confirmed in `products/models.py:49-54`. |

**Standing rules (unchanged):** never break the live site; every phase ships working;
never hard-delete a Cloudinary file (soft-delete in DB only; physical purge is a
separate manual step); write tests alongside each phase; read neighbouring code first.
**Stop at the end of each phase and wait for confirmation.**

---

## Phase 0 — Discovery (DONE)

Findings:

- **Stack:** Django 6.0.4, DRF 3.17, SimpleJWT, PostgreSQL (`dj_database_url`),
  Django migrations, `manage.py test`, pip/`requirements.txt`.
- **Image-bearing models today** (all use `core.utils.images.CompressedImageField`):
  `Category.image`, `HeroSlide.image`, `Product.image`, `ProductImage` (product gallery),
  `ProductColorImage` (per product+color, shared across variations),
  `ProductVariation.image`, `VariationImage` (variation gallery). **Seven image slots, no shared asset.**
- **Storage:** Cloudinary via `core.storage.TimeoutMediaCloudinaryStorage` (a monkey-patched
  `MediaCloudinaryStorage` that adds a 30s upload timeout). Cloudinary is the CDN.
  `django-cloudinary-storage==0.3.0` (old, already patched).
- **No background queue** (no Celery/RQ/django-Q/Redis in `requirements.txt` or `render.yaml`).
- **Admin:** Django admin + Jazzmin, custom vanilla JS in `products/static/admin/js/`.
- **Frontend:** React storefront renders raw Cloudinary URLs directly
  (`<img src={product.image}>`) — no `srcset`, no `<picture>`, no transforms yet.
- **Product↔category:** many-to-many already (see above). No duplication of product rows.

---

## Phase 1 — Schema ✅ DONE (safe, additive; existing image columns untouched)

Implemented as new app **`medialib`** (named to avoid colliding with the existing
`Backend/media/` dir and `MEDIA_ROOT`). Registered in `INSTALLED_APPS`. Migration
`medialib/0001_initial.py` created and applied. `manage.py check` clean; 6 unit tests
pass (unique `file_hash`, unique `storage_key`, cross-entity reuse, unique-per-role
constraint, PROTECT-on-delete). Two models:

**`MediaAsset`** → table `media_assets`
- `id` bigint PK
- `storage_key` varchar unique — Cloudinary public_id / stored path
- `file_hash` char(64) unique — SHA-256 of **stored** bytes (dedup key)
- `original_filename` varchar
- `mime_type` varchar
- `width`, `height` int
- `file_size` bigint
- `alt_text` text null — **set once per asset, reused everywhere**
- `title` varchar null
- `tags` JSONField (default list)
- `folder` varchar null
- `variants` JSONField — **stores Cloudinary transform recipes/URLs, not stored files**
- `uploaded_by` FK → user, null, `on_delete=SET_NULL`
- `created_at`, `updated_at`
- `deleted_at` null — **soft delete only**

**`MediaAttachment`** → table `media_attachments`
- `id` bigint PK
- `media` FK → `MediaAsset`, **`on_delete=PROTECT`** (never orphan)
- `attachable_type` varchar (`product` | `category` | `banner` | `variation` | `product_color` | `lookbook`)
- `attachable_id` bigint
- `role` varchar (`primary` | `gallery` | `swatch`)
- `sort_order` int default 0
- `created_at`

Constraints/indexes:
- Unique `(media, attachable_type, attachable_id, role)`
- Index `(attachable_type, attachable_id, sort_order)` — hot read path
- Index on `file_hash`

Deliverable: migration in the chosen app, models, `__str__`, admin registration (basic).
**No existing columns dropped or altered.**

---

## Phase 2 — Upload service ✅ DONE (synchronous, Cloudinary-native, no queue)

Implemented `medialib/storage.py` (the swappable Cloudinary seam) and
`medialib/services.py::ingest_upload(file, *, uploaded_by, folder, filename, …)`
→ returns `(asset, deduplicated: bool)`. 7 new unit tests pass (13 total): new
upload creates asset + calls storage once, duplicate returns existing with **no
second storage write**, distinct images are not deduped, soft-deleted asset is
revived on re-upload, invalid/oversized/unsupported files rejected before any
upload. Storage is mocked in tests so they never hit Cloudinary.

A service function (`medialib/services.py::ingest_upload`) that:

1. Validates: allowed MIME (`jpeg`, `png`, `webp`, `avif`), max 15 MB, verify **file
   signature** (Pillow `Image.open().verify()`, reuse `core/utils/images.py` logic).
2. Runs the existing `CompressedImageField` compression path so stored bytes match
   what the rest of the site produces.
3. Computes **SHA-256 of the compressed bytes**.
4. **Dedup check on `file_hash` first.** Match → return existing asset with
   `deduplicated=True`, no second Cloudinary upload.
5. New file → strip EXIF (Pillow already drops it on re-encode; confirm), upload to
   Cloudinary via `cloudinary.uploader` (or the storage backend), record
   `storage_key` = public_id, insert `MediaAsset`.
6. Populate `variants` with **Cloudinary transform URL templates** for widths
   200/400/800/1600 using `f_auto,q_auto` — these are generated on first request by
   Cloudinary, so this step is instant and the admin response is fast. **No background job.**

Tests: dedup returns existing asset (no 2nd upload — mock Cloudinary); invalid MIME rejected;
oversized rejected; `variants` recipe built correctly; hash computed on compressed bytes.

---

## Phase 3 — API ✅ DONE (plain staff-gated admin views, NOT DRF)

Decision (see turn discussion): the picker only runs inside the Django admin session,
so DRF's JWT/serializer/browsable-API machinery buys nothing. Built as plain
`@staff_member_required` views returning `JsonResponse` — the same pattern as the
existing `variation_upload_images` admin view. Files: `medialib/views.py`,
`medialib/urls.py` (mounted at `/admin/medialib/`), `medialib/presenters.py`
(plain-dict serialisation + batched usage labels). Endpoints: asset list
(search/folder/tag, paginated 40), detail, upload (dedup), update (alt/title/tags/
folder), usage, soft-delete (409 if in use unless `?force=true`), and polymorphic
attach / reorder / detach / list. 7 view tests pass (staff-gating, upload→dedup,
search, attach+reorder+detach, delete-blocked-then-forced, usage labels, alt update).

## Phase 3 (original spec) — API (DRF, staff-only)

Auth: restrict to staff (`IsAdminUser`) — the picker runs inside the Django admin
session; expose the same endpoints under `/api/media/` for the picker JS (CSRF or
session auth, matching admin, not JWT).

```
POST   /api/media/                    upload → { asset, deduplicated: bool }
GET    /api/media/                    ?search=&tag=&folder=&page=&per_page=  (paginated, default 40)
GET    /api/media/:id/
PATCH  /api/media/:id/                alt_text, title, tags, folder
GET    /api/media/:id/usage/          → every attachment: type, id, human label
DELETE /api/media/:id/                soft delete; 409 if usage>0 unless ?force=true

POST   /api/:type/:id/media/          attach media ids with role + sort_order
PATCH  /api/:type/:id/media/reorder/  bulk sort_order update
DELETE /api/:type/:id/media/:mediaId/ detach (never deletes the asset)
```

Listing returns **thumbnail transform URLs only** (e.g. `w_200,f_auto,q_auto`), never
full-size; must stay fast at 5,000+ assets (paginate, index-backed).

---

## Phase 4 — Media picker ✅ DONE (Django admin, vanilla JS)

Built `medialib/static/medialib/js/media_picker.js` + `css/media_picker.css`: a
self-initialising widget (`.media-picker-field`) that renders an entity's current
attachments as a drag-to-reorder strip with per-image detach, and a shared modal
with **Library** (search + grid + multi-select + infinite "load more") and **Upload**
(drag-drop, per-file progress, duplicate → "Already in library — reusing existing
image") tabs. Wired into `ProductAdmin` as an additive "Media Library" section
(`products/admin.py`) — **existing inlines are untouched**, so nothing breaks. Rolls
out to other slots by dropping the same `<div class="media-picker-field" …>` in.
Note: alt-text inspector panel is stubbed via the update endpoint; a fuller inline
inspector is a follow-up.

## Phase 4 (original spec) — Media picker (Django admin, vanilla JS)

A reusable admin widget, opened as a modal from every image slot, styled to match the
existing admin (reuse patterns from `variation_inline_images.js`). **No React, no new
UI framework, no backend build step.**

- **Library tab:** thumbnail grid, search (filename/alt/tag), filter by folder/tag,
  paginated/infinite scroll, single + multi select, selected items marked.
- **Upload tab:** drag-drop + browse, multiple files, per-file progress. Duplicate →
  "Already in library — reusing existing image" (not an error).
- After select: chosen images shown as a **drag-to-reorder** strip, mark one `primary`,
  per-image detach.
- **Alt text edited on the asset** in an inspector panel (not per placement) — call out
  the SEO benefit in the UI.
- Before delete: show usage count + list; block in-use deletion unless forced.

Ship it on **one** slot first (e.g. product gallery) to prove the pattern, then roll out.
Existing inline upload paths stay working until Phase 7.

---

## Phase 5 — Data migration ✅ DONE (idempotent, resumable, dry-run)

Implemented `medialib/management/commands/migrate_media.py` with `--dry-run`,
`--resume`, `--limit`, `--checkpoint`, `--log`. Enumerates all seven legacy slots,
downloads each distinct Cloudinary file **once** (cached per public_id), SHA-256s the
bytes, dedups byte-identical files across entities into one `MediaAsset`, and creates
`MediaAttachment` rows preserving order/primary. Idempotent (asset unique on hash,
attachment unique on (media,type,id,role); re-runs create nothing) and resumable
(checkpoint file). Legacy columns + Cloudinary files untouched. 4 tests pass:
cross-entity dedup collapses to one asset, distinct files stay distinct, `--dry-run`
writes nothing, re-run is idempotent. **Not yet run against production** — that's a
manual step you trigger (`--dry-run` first) once you're ready.

## Phase 5 (original spec) — Data migration (idempotent, resumable, dry-run)

Management command `migrate_media` with `--dry-run`, `--resume`, `--limit`.

### Design decision A — the etag question (avoid downloading every file)

Our dedup key is SHA-256 of the *stored* bytes. Naively that means downloading all
~N Cloudinary originals to hash them — slow and rate-limited. But Cloudinary's Admin
API returns an **`etag`** per asset, which is the **MD5 of the stored bytes**. Because
every existing image was already run through `CompressedImageField` on its original
upload, the Cloudinary original *is* our "stored bytes" — so its etag is a valid
content fingerprint for a first-pass grouping.

Decision: **use `etag` as a cheap pre-filter, keep SHA-256 as the real key.** We do NOT
store MD5 in the schema (no column churn); etag is used only transiently during the
migration to decide which files actually need downloading (see two-pass below). This
turns "download N files" into "download only the handful that share an etag."

### Design decision B — two-pass migration

- **Pass 1 (metadata only, no downloads):** page through the Cloudinary Admin API and
  collect `(public_id, etag, bytes, width, height)` for every asset. Group by `etag`:
  - **Unique etag** → cannot be a byte-dup of anything else → create the `MediaAsset`
    directly from metadata. Compute SHA-256 lazily: download *once* only when the row
    is first created (or defer — a unique etag row can even store a
    `sha256:<pending>` sentinel and be backfilled, but default is download-once).
  - **Shared etag (≥2 assets)** → *candidate* duplicates only (MD5 collisions are
    astronomically unlikely but etag can differ from our SHA if Cloudinary ever
    re-encoded) → download just these, SHA-256 to confirm, collapse the true matches.
- **Pass 2 (build references):** walk the seven legacy slots; for each image reference
  insert a `MediaAttachment` pointing at the deduplicated asset, preserving current
  order and primary designation. Idempotent: keyed on
  `(media, attachable_type, attachable_id, role)` so re-runs skip existing rows.

Both passes are resumable (checkpoint file / progress table keyed on public_id) and
`--dry-run` prints the full report writing nothing.

Legacy image columns and Cloudinary files remain **completely untouched** — purging
duplicates is a separate manual step after sign-off (Phase 7).

### Steps

1. Enumerate every image reference across the seven slots.
2. Resolve each to its Cloudinary `public_id` + `etag` (Pass 1, metadata only — download
   bytes only for shared-etag candidates or first creation, per decision A/B above).
3. Group by hash → one `MediaAsset` per unique hash; carry over alt text (keep longest
   non-empty on conflict). Reuse the existing Cloudinary `public_id` as `storage_key`
   (no re-upload needed — the file already lives on Cloudinary).
4. Insert `MediaAttachment` rows preserving current order + primary designation.
5. `variants` = Cloudinary transform recipes (instant; nothing to generate/throttle).
6. Report: refs scanned, unique assets, duplicates collapsed, Cloudinary objects that
   could now be purged (manual step later), failures/missing.

Safety: `--dry-run` writes nothing; legacy columns + Cloudinary files **untouched**;
resumable; logs to a file.

---

## Phase 6 — Frontend delivery ✅ DONE (Cloudinary transforms)

Backend: `ProductSerializer` gains an **additive** `library_media` field (empty until
the migration runs, so existing clients are unaffected), batch-loaded in
`ProductViewSet.get_serializer` in ONE query to avoid N+1 (the attachment table is
polymorphic, so a plain `prefetch_related` can't reach it).

Frontend: `src/utils/cloudinary.js` (`cldUrl`/`cldSrcSet` — insert `f_auto,q_auto,
w_*,c_limit` after `/upload/`) + `src/components/shared/ResponsiveImage.jsx` (drop-in
`<img>` with `srcset`/`sizes`, `loading=lazy`, `fetchPriority=high` for LCP images;
non-Cloudinary URLs pass through unchanged). Wired into the highest-impact renders:
ProductDetail main image (priority), CategoryProducts + Catalog + Home category cards,
Home hero (priority). **This works on today's raw Cloudinary URLs**, so the LCP/page-
weight win lands immediately — it does not wait on the migration. `npm run build`
passes. Alt is always rendered from the source.

**To measure (manual):** run Lighthouse on a category listing page before/after —
expect the browser to fetch ~400px WebP/AVIF on mobile instead of the full original.

## Phase 6 (original spec) — Frontend delivery (Cloudinary transforms)

1. Product/category/home image rendering reads from `media_attachments` via the API.
2. Emit `<picture>` with `srcset`/`sizes` built from **Cloudinary transform URLs**
   (`f_auto` handles AVIF→WebP→JPEG negotiation automatically; `q_auto` for quality).
   No stored variant files.
3. `loading="lazy"` below the fold; `fetchpriority="high"` on the primary product image.
4. `alt` always from the asset.
5. Cloudinary already sets long-lived immutable cache headers on transformed URLs.
6. Eliminate N+1 — `prefetch_related` attachments with products (mirror the existing
   `_CART_PREFETCH` pattern).

Measure page weight + LCP on a listing page before/after.

---

## Phase 7 — Cutover ⏳ MANUAL (your call, staged; nothing here is destructive yet)

Everything shipped so far is **additive** — the old system still fully works. Phase 7 is
the deliberate, staged switch-over, run by you when ready:

1. **Deploy** current code. Migration `medialib/0001` is already applied to Supabase; the
   products serializer/frontend changes carry **no new DB migration** (verified). The
   picker appears in Product admin; the storefront already serves responsive images.
2. **Backfill (you trigger):** `python manage.py migrate_media --dry-run` → review the
   report → `python manage.py migrate_media`. This is read-only against legacy data; it
   only *adds* `media_assets` / `media_attachments` rows.
3. **Verify parity:** spot-check that products/categories/slides render the same images;
   the admin picker shows the migrated library.
4. **Roll the picker to the other six slots** (drop the `.media-picker-field` div into
   each admin form) and retire the direct-upload inlines — one slot at a time.
5. **Keep legacy columns read-only ~30 days** as a rollback path (no code change needed;
   just stop writing to them once the picker owns each slot).
6. **Only after your sign-off:** drop legacy image columns (a new migration) and purge
   now-duplicate Cloudinary objects (a separate, explicit, manual script). **Never**
   automated — soft-delete in the DB is the only deletion the code performs.

---

## Status summary

| Phase | State |
|---|---|
| 0 Discovery | ✅ |
| 1 Schema (`medialib` app, 2 tables) | ✅ applied to Supabase |
| 2 Dedup upload service | ✅ |
| 3 Admin API (plain staff views) | ✅ |
| 4 Picker UI + Product-admin wiring | ✅ (pilot slot; 6 slots remain for rollout) |
| 5 `migrate_media` command | ✅ built + tested (not yet run on prod) |
| 6 Frontend responsive images + additive API | ✅ (`npm run build` passes) |
| 7 Cutover | ⏳ manual, staged — your call |

**Tests:** 24 pass on real Postgres (`DATABASE_URL="postgresql://postgres@127.0.0.1:55432/postgres"`).
**Nothing destructive has run.** The live site is unaffected until you deploy + backfill.
