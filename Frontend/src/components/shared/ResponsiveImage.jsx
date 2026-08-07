import { cldUrl, cldSrcSet, isCloudinaryUrl, SRCSET_WIDTHS } from '../../utils/cloudinary';

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
