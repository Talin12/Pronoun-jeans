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
 *   priority   true → eager load + fetchPriority=high (use for LCP images only)
 *   widths     srcset widths (default 200/400/800/1600)
 */
export default function ResponsiveImage({
  src,
  alt = '',
  sizes = '100vw',
  priority = false,
  widths = SRCSET_WIDTHS,
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

  const common = {
    alt,
    className,
    decoding: 'async',
    loading: priority ? 'eager' : 'lazy',
    fetchPriority: priority ? 'high' : undefined,
    ...rest,
  };

  if (!isCloudinaryUrl(src)) {
    return <img src={src} {...common} />;
  }

  return (
    <img
      src={cldUrl(src, { width: 800 })}
      srcSet={cldSrcSet(src, widths)}
      sizes={sizes}
      {...common}
    />
  );
}
