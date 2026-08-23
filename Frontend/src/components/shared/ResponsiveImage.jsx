import { cldUrl, cldSrcSet, isCloudinaryUrl, SRCSET_WIDTHS } from '../../utils/cloudinary';

// One warning per image, not one per render — a carousel would otherwise bury
// the console. Dev only: import.meta.env.DEV is folded away at build time, so
// neither the check nor the Set survives into production.
const warnedFor = new Set();

/**
 * Drop-in <img> replacement that emits a responsive, modern-format image from a
 * Cloudinary URL (srcset + sizes + f_auto/q_auto), so mobile downloads a 400px
 * file instead of the full-size original. Non-Cloudinary URLs render unchanged.
 *
 * Props:
 *   src        image URL
 *   alt        REQUIRED for a11y/SEO — always render it from the asset
 *   sizes      responsive sizes hint (default '100vw')
 *   priority   true → eager, fetchPriority=high, and a matching <link rel=preload>
 *   widths     srcset widths (default 200/400/800/1600)
 *   width      intrinsic width, in px — see the note on layout shift below
 *   height     intrinsic height, in px
 *
 * On width/height and CLS: most callers here render into a box the stylesheet
 * has already sized (h-48, h-64, aspect-square, or w-full h-full inside a fixed
 * parent), and a box that exists before the image arrives cannot shift. Pass
 * width and height where that is *not* true — the clearest case being an image
 * sized `h-12 w-auto`, whose width is zero until the bytes land and whose
 * neighbours slide sideways when they arrive.
 */
export default function ResponsiveImage({
  src,
  alt = '',
  sizes = '100vw',
  priority = false,
  widths = SRCSET_WIDTHS,
  width,
  height,
  className,
  ...rest
}) {
  if (!src) return null;

  // Every image this component renders is content — a garment, a category, a
  // hero — so an empty alt is a bug, not a decorative-image declaration. The
  // asset carries alt_text; the caller has to pass it down.
  if (import.meta.env.DEV && !alt && !warnedFor.has(src)) {
    warnedFor.add(src);
    console.warn(
      `[a11y/seo] <ResponsiveImage> rendered with no alt text: ${src}`,
      '\nPass alt from the asset (alt_text), or a description of the garment.',
    );
  }

  const cloudinary = isCloudinaryUrl(src);
  const imgSrc = cloudinary ? cldUrl(src, { width: 800 }) : src;
  const imgSrcSet = cloudinary ? cldSrcSet(src, widths) : undefined;

  const img = (
    <img
      src={imgSrc}
      srcSet={imgSrcSet}
      sizes={cloudinary ? sizes : undefined}
      width={width}
      height={height}
      alt={alt}
      className={className}
      decoding="async"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      {...rest}
    />
  );

  if (!priority) return img;

  // The LCP image gets a preload in <head> — React 19 hoists <link> there —
  // so the browser starts fetching while it is still parsing, instead of when
  // it reaches the <img> further down the body.
  //
  // Built from the same imgSrc/imgSrcSet/sizes as the <img> above rather than
  // recomputed, because a preload that does not match the img is not a head
  // start, it is a second download.
  return (
    <>
      <link
        rel="preload"
        as="image"
        href={imgSrc}
        imageSrcSet={imgSrcSet}
        imageSizes={imgSrcSet ? sizes : undefined}
        fetchPriority="high"
      />
      {img}
    </>
  );
}
