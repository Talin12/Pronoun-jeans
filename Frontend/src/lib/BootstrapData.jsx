/**
 * Serialises prerendered page data into the HTML, for src/lib/bootstrap.js to
 * read back on boot. See that file for why this exists.
 *
 * Renders nothing visible. `<` is escaped so a product description containing
 * "</script>" cannot close the block early.
 *
 * What goes in here is public by definition — it ends up in the HTML of a page
 * anyone can view. That is safe for exactly one reason: the prerenderer runs
 * signed out, so what it captures is the anonymous API payload, in which
 * b2b_price and set_price are already null. Never bootstrap a payload fetched
 * with credentials.
 *
 * Kept in its own file because the reader is a plain function and this is a
 * component; a module exporting both breaks React Fast Refresh.
 */
export default function BootstrapData({ id, data }) {
  return (
    <script
      type="application/json"
      data-bootstrap={id}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
