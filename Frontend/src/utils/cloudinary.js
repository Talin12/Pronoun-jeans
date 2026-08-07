// Helpers to derive responsive Cloudinary variants from an existing image URL.
//
// The storefront already receives full Cloudinary URLs (e.g.
// https://res.cloudinary.com/<cloud>/image/upload/v123/products/foo.jpg).
// Inserting a transformation segment after `/upload/` lets Cloudinary generate
// a right-sized, modern-format derivative on the fly — no stored variants, no
// backend change, works on today's data as well as migrated media-library URLs.

export const SRCSET_WIDTHS = [200, 400, 800, 1600];

export function isCloudinaryUrl(url) {
  return typeof url === 'string'
    && url.includes('res.cloudinary.com')
    && url.includes('/upload/');
}

// Build a transformed URL. `f_auto` negotiates AVIF/WebP/JPEG per browser,
// `q_auto` picks quality, `c_limit` never upscales past the original.
export function cldUrl(url, { width, quality = 'auto', format = 'auto' } = {}) {
  if (!isCloudinaryUrl(url)) return url;
  const parts = [`f_${format}`, `q_${quality}`];
  if (width) { parts.push(`w_${width}`, 'c_limit'); }
  return url.replace('/upload/', `/upload/${parts.join(',')}/`);
}

export function cldSrcSet(url, widths = SRCSET_WIDTHS) {
  if (!isCloudinaryUrl(url)) return undefined;
  return widths.map((w) => `${cldUrl(url, { width: w })} ${w}w`).join(', ');
}
