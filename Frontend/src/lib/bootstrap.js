// Carries prerendered data across the hand-off to React.
//
// The problem this solves: scripts/prerender.mjs writes real HTML — the hero
// image, the product grid — and then the browser boots the SPA on top of it.
// React mounts with createRoot, so it throws that markup away and re-renders
// from empty state, and every page puts a spinner or a grey placeholder up
// while it re-fetches what it was already showing.
//
// Measured on the phase-3 build over Slow 4G: the homepage LCP was 11.2s,
// because the hero the prerenderer had baked in was discarded and the browser
// then waited on a cold Render instance for the URL of the image to paint.
// /catalog/shorts scored 0.89 CLS, because thirteen prerendered product cards
// collapsed into one small spinner and then came back.
//
// So the page serialises what it fetched into the HTML it produces, and reads
// it back as its initial state. First paint keeps what the prerenderer already
// proved it could render; the fetch still runs and replaces it the moment
// fresher data arrives.
//
// The snapshot is taken at module-evaluation time, which is the last moment it
// can be: React empties #root when it mounts, and these <script> tags live
// inside it.

const SNAPSHOT = new Map();

if (typeof document !== 'undefined') {
  for (const el of document.querySelectorAll('script[data-bootstrap]')) {
    try {
      SNAPSHOT.set(el.dataset.bootstrap, JSON.parse(el.textContent));
    } catch {
      // A malformed blob is not worth failing a page load over — the fetch
      // that follows will fill the gap.
    }
  }
}

/**
 * The data prerendered for `key`, or null.
 *
 * Non-destructive: a component may read it on every mount. Returning it again
 * after a client-side navigation back to the same route is harmless — it is
 * the same content the visitor saw a moment ago, and the fetch behind it
 * corrects anything stale.
 */
export function readBootstrap(key) {
  return SNAPSHOT.has(key) ? SNAPSHOT.get(key) : null;
}
