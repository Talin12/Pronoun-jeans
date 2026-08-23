// Client-side image compression for admin uploads.
//
// Phone and camera photos arrive at 8–25 MB each. Sending them untouched means
// the browser pushes tens of megabytes over a slow upstream, and the server
// then decodes every one of them inside a single request — the two things that
// made large uploads fail. Re-encoding in the browser first turns a 12 MB photo
// into ~1.5 MB with no visible difference, so the network carries a tenth of
// the bytes and the backend's own compressor has nothing left to do.
//
// The output deliberately lands under the backend's passthrough threshold
// (2.5 MB, long edge 2500 px — see Backend/core/utils/images.py), so what we
// send is stored byte-for-byte instead of being decoded and re-encoded again.

// Long edge cap — same as the backend's MAX_DIMENSION, so nothing is lost by
// letting the client do the resize.
export const MAX_DIMENSION = 2500;

// Aim below the backend's PASSTHROUGH_BYTES (2.5 MB) with room to spare.
const TARGET_BYTES = 2 * 1024 * 1024;

// Anything this small is already cheap to send, and a re-encode would only
// throw away quality for a few hundred KB.
const SKIP_BYTES = 1024 * 1024;

// Tried in order until the result fits TARGET_BYTES. 0.9 is visually
// indistinguishable from the original; the ladder only steps down for images
// that stay huge at that setting.
const QUALITY_STEPS = [0.9, 0.82, 0.74];

// Formats that may carry transparency, which JPEG cannot represent.
const ALPHA_TYPES = /^image\/(png|webp|avif)$/i;

// Animated — re-encoding through a canvas would keep the first frame only.
const ANIMATED_TYPES = /^image\/(gif|apng)$/i;

const canUseCanvas = () =>
  typeof document !== 'undefined' && typeof createImageBitmap !== 'undefined';

/** Decode to something drawable, honouring EXIF orientation. */
async function decode(file) {
  // `imageOrientation` is what applies the EXIF rotation; without it a photo
  // shot in portrait would be stored sideways. Browsers that reject the option
  // fall back to an <img>, which applies the rotation on its own.
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await decodeViaElement(file);
  }
}

function decodeViaElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

const toBlob = (canvas, type, quality) =>
  new Promise(resolve => canvas.toBlob(resolve, type, quality));

function replaceExtension(name, ext) {
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.${ext}`;
}

/**
 * Re-encode one image so it is small enough to upload comfortably.
 *
 * Always resolves to a File: anything that cannot be processed (a format the
 * browser will not decode, an animation, a canvas that refuses to encode)
 * comes back untouched so the upload still happens and the server decides.
 */
export async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/')) return file;
  if (ANIMATED_TYPES.test(file.type)) return file;
  if (file.size <= SKIP_BYTES) return file;
  if (!canUseCanvas()) return file;

  let source;
  try {
    source = await decode(file);
  } catch {
    return file;
  }

  const width  = source.naturalWidth  || source.width;
  const height = source.naturalHeight || source.height;
  if (!width || !height) return file;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(width  * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const keepAlpha = ALPHA_TYPES.test(file.type);
  const ctx = canvas.getContext('2d', { alpha: keepAlpha });
  if (!ctx) return file;
  ctx.imageSmoothingQuality = 'high';
  if (!keepAlpha) {
    // JPEG has no alpha; without this a transparent source turns black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();

  // WebP where transparency has to survive, JPEG otherwise — both are formats
  // the media library accepts, and JPEG is what the backend would have chosen.
  const type = keepAlpha ? 'image/webp' : 'image/jpeg';
  let blob = null;
  for (const quality of QUALITY_STEPS) {
    const attempt = await toBlob(canvas, type, quality);
    if (!attempt) break;
    blob = attempt;
    if (attempt.size <= TARGET_BYTES) break;
  }
  // A browser that cannot encode the requested type silently hands back PNG.
  if (!blob || (blob.type !== type && !keepAlpha)) return file;

  // Already-optimised images can grow on a round trip through the canvas —
  // when that happens the original is simply the better file to send.
  if (blob.size >= file.size) return file;

  const ext  = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const name = replaceExtension(file.name, ext);
  return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
}

/**
 * Split files across requests by total bytes rather than a fixed count.
 *
 * Photo sizes are unpredictable, so "three per request" is either wasteful
 * (three 300 KB images) or too big (three 10 MB ones). Packing to a byte budget
 * instead keeps every request roughly the same weight: two 7 MB images go
 * together, a 12 MB one travels alone, and a dozen small ones share a trip.
 * A file larger than the budget still gets its own batch — refusing to send it
 * here would only hide the server's own size error.
 *
 * `maxPerBatch` caps how much a single failure can cost when the files are all
 * small, and keeps the server from decoding a long queue inside one request.
 * `sizeOf` lets callers pack objects that carry a file alongside other data.
 */
export function planBatches(items, { budgetBytes, maxPerBatch, sizeOf = f => f.size || 0 }) {
  const batches = [];
  let batch = [];
  let bytes = 0;

  for (const item of items) {
    const size = sizeOf(item);
    if (batch.length && (bytes + size > budgetBytes || batch.length >= maxPerBatch)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(item);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
