import { useEffect } from 'react';
import { cldOgUrl } from '../../utils/cloudinary';
import {
  SITE_NAME,
  TITLE_SUFFIX,
  DEFAULT_OG_IMAGE,
  absoluteUrl,
  clampDescription,
} from '../../config/site';

// index.html carries a set of site-wide defaults so the pre-hydration HTML is
// never bare — that is all a scraper which does not run JavaScript will ever
// see. React 19 hoists the tags below into <head> by *appending* them, and the
// HTML spec resolves a duplicate <title> to the first one in tree order, so
// left alone the static default would beat every per-page title. Dropping the
// defaults the first time a <Seo> mounts hands metadata over to the router and
// leaves exactly one of each tag in the document.
function dropStaticDefaults() {
  document.querySelectorAll('head [data-default-meta]').forEach((el) => el.remove());
}

// Product and category images live on Cloudinary, which can crop them to the
// exact frame Open Graph expects. Anything else falls back to the site card:
// an image whose real dimensions we cannot state is worse than a generic one.
function resolveOgImage(image) {
  if (!image) return DEFAULT_OG_IMAGE;
  const cropped = cldOgUrl(image);
  return cropped
    ? { url: cropped, width: 1200, height: 630 }
    : DEFAULT_OG_IMAGE;
}

/**
 * Per-page metadata, rendered inline by the page that owns it.
 *
 * No helper library: React 19 hoists <title>, <meta> and <link> into <head>
 * natively, which is the whole reason this stays a plain component.
 *
 * @param {string}  title       Page title, without the brand suffix.
 * @param {string}  description 140-160 characters of real copy.
 * @param {string}  canonical   Path, not an absolute URL — e.g. '/catalog'.
 * @param {string} [image]      Absolute image URL; defaults to the site card.
 * @param {string} [type]       Open Graph object type.
 * @param {boolean} [noindex]   Keep the page out of the index entirely.
 * @param {React.ReactNode} [children] Page-specific JSON-LD.
 */
const Seo = ({
  title,
  description,
  canonical,
  image,
  type = 'website',
  noindex = false,
  children,
}) => {
  useEffect(dropStaticDefaults, []);

  // Titles that already name the brand — "About Pronoun Jeans — …" — would read
  // as a stutter with the suffix bolted on.
  const fullTitle = title.includes(SITE_NAME) ? title : `${title}${TITLE_SUFFIX}`;
  const url = absoluteUrl(canonical);
  const desc = clampDescription(description);
  const og = resolveOgImage(image);

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={og.url} />
      <meta property="og:image:width" content={String(og.width)} />
      <meta property="og:image:height" content={String(og.height)} />
      <meta property="og:locale" content="en_IN" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={og.url} />

      {children}
    </>
  );
};

export default Seo;
