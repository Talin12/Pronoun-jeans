import { useEffect } from 'react';

const ATTR = 'data-prerender-ready';

/**
 * Marks the document as safe to snapshot.
 *
 * scripts/prerender.mjs waits for this attribute before capturing HTML.
 * Network idle alone is not a usable signal here: the catalogue pages fire
 * their fetch from an effect *after* first paint, so there is a window where
 * the network is quiet and the page is still an empty skeleton. A page that
 * owns data says so itself, once its own state says the data has landed.
 *
 * Pages with nothing to fetch call this with no argument and are ready
 * immediately.
 *
 * The attribute is removed on unmount so a client-side route change cannot
 * leave a stale "ready" behind — irrelevant during prerendering, where each
 * route gets a fresh page, but it keeps the signal honest in the live app.
 *
 * @param {boolean} [ready=true] Whether this page's data has resolved.
 */
export function usePrerenderReady(ready = true) {
  useEffect(() => {
    if (!ready) return undefined;
    document.documentElement.setAttribute(ATTR, 'true');
    return () => document.documentElement.removeAttribute(ATTR);
  }, [ready]);
}
