/**
 * One JSON-LD block.
 *
 * React 19 hoists <title>, <meta> and <link> into <head>, but not <script> —
 * this renders inline wherever it is placed, which is fine: JSON-LD is read
 * from anywhere in the document.
 *
 * `<` is escaped so a stray "</script>" inside product copy typed into the
 * admin panel cannot close the block early and spill markup into the page.
 */
const JsonLd = ({ data }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
  />
);

export default JsonLd;
