/**
 * Thin wrappers over the superuser-only admin API (/api/admin/*).
 * Every call goes through the shared axios instance, so JWT auth + refresh are
 * handled automatically. The backend enforces IsSuperUser on all of these.
 */
import api from './axios';
import { compressImage, planBatches } from '../utils/imageCompression';

// ── Users, permissions & verification ──────────────────────────────────────
export const listUsers = (params = {}) =>
  api.get('admin/users/', { params }).then(r => r.data);

export const getUser = (id) =>
  api.get(`admin/users/${id}/`).then(r => r.data);

export const createUser = (data) =>
  api.post('admin/users/', data).then(r => r.data);

export const updateUser = (id, data) =>
  api.patch(`admin/users/${id}/`, data).then(r => r.data);

// ── Products ───────────────────────────────────────────────────────────────
export const listProducts = (params = {}) =>
  api.get('admin/products/', { params }).then(r => r.data);

export const getProduct = (id) =>
  api.get(`admin/products/${id}/`).then(r => r.data);

export const createProduct = (data) =>
  api.post('admin/products/', data).then(r => r.data);

export const updateProduct = (id, data) =>
  api.patch(`admin/products/${id}/`, data).then(r => r.data);

/**
 * The share image is a file, so it cannot ride in the JSON Base Details
 * payload. Kept as its own call for that reason — and so that touching it can
 * never disturb the publish flow, which sends every base field at once.
 */
export const setProductOgImage = async (id, file) => {
  const fd = new FormData();
  // Share cards are 1200x630 crops of whatever is uploaded, so sending a raw
  // camera photo only buys a slow request — shrink it the same way media
  // library uploads are shrunk.
  fd.append('og_image', await compressImage(file).catch(() => file));
  return api.patch(`admin/products/${id}/`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

/** Clearing needs JSON: multipart has no way to say null. */
export const clearProductOgImage = (id) =>
  api.patch(`admin/products/${id}/`, { og_image: null }).then(r => r.data);

export const deleteProduct = (id) =>
  api.delete(`admin/products/${id}/`).then(r => r.data);

// ── Variations ─────────────────────────────────────────────────────────────
export const listVariations = (productId) =>
  api.get('admin/variations/', { params: { product: productId } }).then(r => r.data);

export const createVariation = (data) =>
  api.post('admin/variations/', data).then(r => r.data);

/** Creates the whole colour × size grid at once. Returns {created, skipped}. */
export const bulkCreateVariations = (data) =>
  api.post('admin/variations/bulk/', data).then(r => r.data);

export const updateVariation = (id, data) =>
  api.patch(`admin/variations/${id}/`, data).then(r => r.data);

export const deleteVariation = (id) =>
  api.delete(`admin/variations/${id}/`).then(r => r.data);

// ── Product attributes (Fit, Fabric, Length, …) ────────────────────────────
//
// Active-only by default, which is what the product editor wants. The
// management page passes includeInactive so a retired attribute stays visible.

export const listAttributes = (includeInactive = false) =>
  api.get('admin/attributes/', includeInactive ? { params: { include_inactive: 'true' } } : undefined)
    .then(r => r.data);

export const createAttribute = (data) =>
  api.post('admin/attributes/', data).then(r => r.data);

export const updateAttribute = (id, data) =>
  api.patch(`admin/attributes/${id}/`, data).then(r => r.data);

export const deleteAttribute = (id) =>
  api.delete(`admin/attributes/${id}/`).then(r => r.data);

/**
 * Add one option to an existing attribute, keeping the ones already there.
 *
 * The API reconciles the whole options list on write, so anything left out is
 * treated as removed — sending only the new option would delete the rest.
 */
export const addAttributeOption = (attribute, value) =>
  updateAttribute(attribute.id, {
    options: [
      ...attribute.options.map(o => ({ id: o.id, value: o.value, order: o.order })),
      { value },
    ],
  });

// ── Reference data ─────────────────────────────────────────────────────────
export const listCategories = () =>
  api.get('admin/categories/').then(r => r.data);

export const getCategory = (id) =>
  api.get(`admin/categories/${id}/`).then(r => r.data);

export const createCategory = (data) =>
  api.post('admin/categories/', data).then(r => r.data);

export const updateCategory = (id, data) =>
  api.patch(`admin/categories/${id}/`, data).then(r => r.data);

export const deleteCategory = (id) =>
  api.delete(`admin/categories/${id}/`).then(r => r.data);

export const listColors = () =>
  api.get('admin/colors/').then(r => r.data);

export const createColor = (data) =>
  api.post('admin/colors/', data).then(r => r.data);

/** Active sets only by default — pass true on the management page, where a
 *  deactivated set must stay visible so it can be switched back on. */
export const listSizeSets = (includeInactive = false) =>
  api.get('admin/size-sets/', includeInactive ? { params: { include_inactive: 'true' } } : undefined)
     .then(r => r.data);

export const createSizeSet = (data) =>
  api.post('admin/size-sets/', data).then(r => r.data);

export const updateSizeSet = (id, data) =>
  api.patch(`admin/size-sets/${id}/`, data).then(r => r.data);

/** 409 with {error} when the set is in use — deactivate it instead. */
export const deleteSizeSet = (id) =>
  api.delete(`admin/size-sets/${id}/`).then(r => r.data);

// ── Hero slides ────────────────────────────────────────────────────────────
//
// The carousel is short, so these are unpaginated — the page holds the whole
// list. Slide images are not posted here: a slide is created caption-first and
// its picture attached through the media endpoints as type "banner", role
// "primary", which is the same slot the Django-admin picker writes.

export const listHeroSlides = () =>
  api.get('admin/hero-slides/').then(r => r.data);

export const createHeroSlide = (data) =>
  api.post('admin/hero-slides/', data).then(r => r.data);

export const updateHeroSlide = (id, data) =>
  api.patch(`admin/hero-slides/${id}/`, data).then(r => r.data);

export const deleteHeroSlide = (id) =>
  api.delete(`admin/hero-slides/${id}/`).then(r => r.data);

/** Persist a drag. `ids` is the new top-to-bottom order; returns the new list. */
export const reorderHeroSlides = (ids) =>
  api.post('admin/hero-slides/reorder/', { order: ids }).then(r => r.data);

// ── Orders ─────────────────────────────────────────────────────────────────
//
// No create or delete: orders come from checkout, and a placed order is a
// record of what someone paid. The panel reads them and moves them along.

export const listOrders = (params = {}) =>
  api.get('admin/orders/', { params }).then(r => r.data);

export const getOrder = (id) =>
  api.get(`admin/orders/${id}/`).then(r => r.data);

/**
 * Only status, payment_status, payment_verified and the three tracking fields
 * are writable — the server treats every money field as read-only, so a stray
 * key here cannot rewrite what was charged.
 */
export const updateOrder = (id, data) =>
  api.patch(`admin/orders/${id}/`, data).then(r => r.data);

/** Counts behind the dashboard tiles and the "needs attention" badge. */
export const getOrderStats = () =>
  api.get('admin/orders/stats/').then(r => r.data);

// ── Carts ──────────────────────────────────────────────────────────────────
//
// Read-only. Every account that has opened the storefront has a cart, so empty
// ones are hidden unless asked for — otherwise the few carts worth a call are
// buried in zeroes.

export const listCarts = (params = {}) =>
  api.get('admin/carts/', { params }).then(r => r.data);

export const getCart = (id) =>
  api.get(`admin/carts/${id}/`).then(r => r.data);

// ── Coupons ────────────────────────────────────────────────────────────────
export const listCoupons = (params = {}) =>
  api.get('admin/coupons/', { params }).then(r => r.data);

export const createCoupon = (data) =>
  api.post('admin/coupons/', data).then(r => r.data);

export const updateCoupon = (id, data) =>
  api.patch(`admin/coupons/${id}/`, data).then(r => r.data);

/** 409 with {error} once the coupon has been redeemed — switch it off instead. */
export const deleteCoupon = (id) =>
  api.delete(`admin/coupons/${id}/`).then(r => r.data);

// ── Media library ──────────────────────────────────────────────────────────
export const listAssets = (params = {}) =>
  api.get('admin/media/assets/', { params }).then(r => r.data);

/** Library sections — "All images" plus one per category, with counts. */
export const listMediaSections = () =>
  api.get('admin/media/sections/').then(r => r.data);

// One request's worth of image bytes. Compression puts most photos near 1–2 MB,
// so this is a ceiling for the odd heavy file rather than a typical payload —
// big enough that small images still travel together, small enough that a batch
// finishes well inside gunicorn's 120 s timeout on a phone connection.
const REQUEST_BUDGET_BYTES = 15 * 1024 * 1024;

// Bytes alone would let fifty thumbnails share one request; this bounds what a
// single failure costs and how many images the server decodes per request.
const MAX_FILES_PER_BATCH = 8;

/** `categoryId` files the upload under that section as well as All images. */
export const uploadAssets = (files, folder, categoryId) => {
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('files', f));
  if (folder) fd.append('folder', folder);
  if (categoryId) fd.append('categories', categoryId);
  return api.post('admin/media/assets/upload/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

/**
 * Upload many files as several requests, sized by bytes rather than by count.
 *
 * Every file is re-encoded in the browser first (see utils/imageCompression),
 * which is what makes the rest predictable: a 12 MB camera photo becomes ~1.5 MB
 * before it ever touches the network. The compressed files are then packed to a
 * REQUEST_BUDGET_BYTES budget, so a request carries two 7 MB images or a dozen
 * small ones — but never a fixed three that happen to add up to 30 MB and time
 * gunicorn out. A file that is still oversized on its own travels alone, which
 * keeps its failure from taking healthy files down with it.
 *
 * Videos pass through both stages untouched — compressImage returns anything
 * that is not an image as-is, and a clip is always over the byte budget, so it
 * gets a request to itself. That is the behaviour we want: a 60 MB upload
 * should not be able to take a batch of photos down with it.
 *
 * Compression renames files (photo.png becomes photo.jpg), so results and
 * errors both carry `sourceFilename` — the name the caller handed in, and the
 * one its queue rows are labelled with.
 *
 * Always resolves: per-file problems come back in `errors`, never as a throw.
 */
export const uploadAssetsInBatches = async (
  files, folder, categoryId,
  { budgetBytes = REQUEST_BUDGET_BYTES, maxPerBatch = MAX_FILES_PER_BATCH, onProgress } = {},
) => {
  const all = Array.from(files);
  const results = [];
  const errors  = [];

  // Sequential: decoding a 48 MP photo costs a few hundred MB of canvas memory,
  // and doing several at once is how a phone browser tab gets killed.
  const prepared = [];
  for (const [i, file] of all.entries()) {
    onProgress?.({ phase: 'compressing', done: i, total: all.length });
    const compressed = await compressImage(file).catch(() => file);
    prepared.push({ file: compressed, sourceFilename: file.name });
  }

  const batches = planBatches(prepared, {
    budgetBytes, maxPerBatch, sizeOf: p => p.file.size || 0,
  });

  // Map one response back onto the files that produced it. The server echoes
  // the compressed filename on failures and reports both lists in request
  // order, so every outcome can be traced to the file the caller handed in —
  // whatever compression renamed it to.
  const absorb = (payload, batch) => {
    const failed = new Set();
    (payload.errors || []).forEach(e => {
      const i = batch.findIndex((p, n) => !failed.has(n) && p.file.name === e.filename);
      if (i >= 0) failed.add(i);
      errors.push({ ...e, filename: i >= 0 ? batch[i].sourceFilename : e.filename });
    });
    const uploaded = batch.filter((_, i) => !failed.has(i));
    (payload.results || []).forEach((r, i) => {
      results.push({
        ...r,
        sourceFilename: uploaded[i]?.sourceFilename ?? r.asset?.original_filename,
      });
    });
  };

  let done = 0;
  for (const batch of batches) {
    try {
      absorb(await uploadAssets(batch.map(p => p.file), folder, categoryId), batch);
    } catch (err) {
      const status = err.response?.status;
      const body   = err.response?.data;
      // A batch where every file was rejected comes back as 400 with the same
      // per-file reasons a mixed batch reports inline — worth keeping, since
      // "too large" is far more useful than "server error 400".
      if (Array.isArray(body?.errors) && body.errors.length) {
        absorb(body, batch);
      } else {
        const detail = body?.error || body?.detail
          || (typeof body === 'string' && body.slice(0, 120));
        const message = detail
          || (status === 413 ? 'Files too large for one request'
            : status === 502 || status === 504 ? 'The server timed out processing these'
            : status ? `Server error ${status}`
            : 'Network dropped or the request timed out');
        batch.forEach(p => errors.push({ filename: p.sourceFilename, error: message }));
      }
    }
    done += batch.length;
    onProgress?.({ phase: 'uploading', done, total: all.length });
  }
  return { results, errors };
};

/**
 * Where an asset is currently used, with human labels — so a delete confirm can
 * name the products a picture is on rather than only counting them.
 */
export const getAssetUsage = (id) =>
  api.get(`admin/media/assets/${id}/usage/`).then(r => r.data);

/**
 * Retire one asset from the library.
 *
 * Soft delete: the file itself is left on Cloudinary, so this clears clutter
 * without destroying anything — and re-uploading the same file brings the very
 * same asset back, because dedup matches on content hash.
 *
 * An asset still attached somewhere rejects with 409 and a body carrying
 * `usage_count` and `usage` (the labelled list). Retry with force once the
 * admin has seen what is in the way; that detaches it everywhere first.
 */
export const deleteAsset = (id, { force = false } = {}) =>
  api.post(`admin/media/assets/${id}/delete/${force ? '?force=true' : ''}`)
     .then(r => r.data);

/** File images already in the library into (or out of) a section. */
export const categorizeAssets = (mediaIds, { add = [], remove = [] } = {}) =>
  api.post('admin/media/assets/categorize/', { media_ids: mediaIds, add, remove })
    .then(r => r.data);

// `role` scopes the result to one slot (cover vs gallery). Omit it only when you
// genuinely want every slot — a picker bound to a role must always pass it.
export const getAttachments = (type, id, role) =>
  api.get(`admin/media/${type}/${id}/attachments/`, role ? { params: { role } } : undefined)
     .then(r => r.data);

export const attachMedia = (type, id, mediaIds, role = 'gallery') =>
  api.post(`admin/media/${type}/${id}/attach/`, { media_ids: mediaIds, role }).then(r => r.data);

export const detachMedia = (type, id, attachmentId) =>
  api.post(`admin/media/${type}/${id}/detach/`, { attachment_id: attachmentId }).then(r => r.data);

export const reorderMedia = (type, id, order) =>
  api.post(`admin/media/${type}/${id}/reorder/`, { order }).then(r => r.data);
