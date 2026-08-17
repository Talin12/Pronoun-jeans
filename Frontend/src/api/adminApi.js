/**
 * Thin wrappers over the superuser-only admin API (/api/admin/*).
 * Every call goes through the shared axios instance, so JWT auth + refresh are
 * handled automatically. The backend enforces IsSuperUser on all of these.
 */
import api from './axios';

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

// ── Media library ──────────────────────────────────────────────────────────
export const listAssets = (params = {}) =>
  api.get('admin/media/assets/', { params }).then(r => r.data);

/** Library sections — "All images" plus one per category, with counts. */
export const listMediaSections = () =>
  api.get('admin/media/sections/').then(r => r.data);

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
 * Upload many files as several small requests instead of one large one.
 *
 * Ten 5 MB phone photos in a single POST is ~50 MB that has to arrive, decode
 * and reach Cloudinary inside one request — slow phone upstream alone can pass
 * gunicorn's timeout, and then the whole batch is lost. In batches, a failure
 * costs you that batch and names the files, and the rest still land.
 *
 * Always resolves: per-file problems come back in `errors`, never as a throw.
 */
export const uploadAssetsInBatches = async (
  files, folder, categoryId, { batchSize = 3, onProgress } = {},
) => {
  const all = Array.from(files);
  const results = [];
  const errors  = [];

  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    try {
      const d = await uploadAssets(batch, folder, categoryId);
      results.push(...(d.results || []));
      errors.push(...(d.errors || []));
    } catch (err) {
      const status = err.response?.status;
      const body   = err.response?.data;
      const detail = body?.error || body?.detail
        || (typeof body === 'string' && body.slice(0, 120));
      const message = detail
        || (status === 413 ? 'Files too large for one request'
          : status === 502 || status === 504 ? 'The server timed out processing these'
          : status ? `Server error ${status}`
          : 'Network dropped or the request timed out');
      batch.forEach(f => errors.push({ filename: f.name, error: message }));
    }
    onProgress?.({ done: Math.min(i + batchSize, all.length), total: all.length });
  }
  return { results, errors };
};

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
