// Serves dist/ for the prerenderer, standing in for Vercel.
//
// One rule that matters: HTML navigations always get the pristine shell that
// `vite build` produced, held in memory from before the first page was
// written. Without that, prerendering /catalog would write
// dist/catalog/index.html, and the next route that touched it would be
// snapshotting an already-snapshotted page.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

export async function startStaticServer({ distDir, shellHtml }) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // normalize() collapses any ../ before it can escape dist/.
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const candidate = join(distDir, relative);

    if (relative && candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()) {
      const ext = extname(candidate).toLowerCase();
      // Even a real index.html on disk is answered with the shell: by the time
      // a later route asks for it, it is a snapshot, not the app.
      if (ext !== '.html') {
        res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
        res.end(await readFile(candidate));
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(shellHtml);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
