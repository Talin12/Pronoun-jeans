/**
 * Thin wrappers over the superuser-only admin API (/api/admin/*).
 * Every call goes through the shared axios instance, so JWT auth + refresh are
 * handled automatically. The backend enforces IsSuperUser on all of these.
 */
import api from './axios';

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

export const listSizeSets = () =>
  api.get('admin/size-sets/').then(r => r.data);

export const createSizeSet = (data) =>
  api.post('admin/size-sets/', data).then(r => r.data);

// ── Media library ──────────────────────────────────────────────────────────
export const listAssets = (params = {}) =>
  api.get('admin/media/assets/', { params }).then(r => r.data);

export const uploadAssets = (files, folder) => {
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('files', f));
  if (folder) fd.append('folder', folder);
  return api.post('admin/media/assets/upload/', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const getAttachments = (type, id) =>
  api.get(`admin/media/${type}/${id}/attachments/`).then(r => r.data);

export const attachMedia = (type, id, mediaIds, role = 'gallery') =>
  api.post(`admin/media/${type}/${id}/attach/`, { media_ids: mediaIds, role }).then(r => r.data);

export const detachMedia = (type, id, attachmentId) =>
  api.post(`admin/media/${type}/${id}/detach/`, { attachment_id: attachmentId }).then(r => r.data);

export const reorderMedia = (type, id, order) =>
  api.post(`admin/media/${type}/${id}/reorder/`, { order }).then(r => r.data);
