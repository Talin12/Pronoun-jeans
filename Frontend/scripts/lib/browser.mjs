// A headless browser with one job: load a URL and hand back the HTML once the
// page says it is finished.
//
// Two drivers behind one interface.
//
//   Playwright — preferred, and what CI is expected to provide. Browsers are
//   taken from PLAYWRIGHT_BROWSERS_PATH (default /opt/pw-browsers) and the
//   download is disabled, so this never reaches for the network.
//
//   Raw CDP — used when Playwright is not installed. It drives whatever Chrome
//   is already on the machine over the DevTools protocol, on Node's built-in
//   WebSocket, with no dependencies at all. Without it, adding prerendering to
//   `npm run build` would break the build for anyone who has Chrome but not
//   Playwright.
//
// Both return { html, errors }, where an error with fatal:true is an uncaught
// exception from the page and fails the build.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Read back with the ready flag already stripped: the attribute is scaffolding
// for the build and has no business in the HTML that ships.
const CAPTURE_EXPRESSION = `(() => {
  document.documentElement.removeAttribute('data-prerender-ready');
  return document.documentElement.outerHTML;
})()`;

// Guarded: polling starts the moment Page.navigate returns, and there is a
// beat while the old document is torn down where documentElement is null.
const READY_EXPRESSION = "!!document.documentElement && document.documentElement.hasAttribute('data-prerender-ready')";
const ROOT_FILLED_EXPRESSION = "!!document.getElementById('root') && document.getElementById('root').children.length > 0";

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const CHROME_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--hide-scrollbars',
  '--mute-audio',
  // Nothing here is signed in, and nothing should try to be: a stray profile
  // or restored session could bake logged-in chrome into every page.
  '--no-first-run',
  '--no-default-browser-check',
  // The bundle calls the API at its absolute production URL, so every request
  // the app makes here is cross-origin from a throwaway localhost port that
  // the backend's CORS_ALLOWED_ORIGINS will never list — and randomly
  // numbered, so it could not be listed. Rather than weaken the API's CORS for
  // the sake of the build, the same-origin policy is switched off in this one
  // ephemeral, headless browser, which loads nothing but our own site and is
  // destroyed when the build ends.
  '--disable-web-security',
];

function findChrome() {
  const explicit = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`CHROME_PATH points at a file that does not exist: ${explicit}`);
    return explicit;
  }
  return CHROME_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

// ── Playwright ───────────────────────────────────────────────────────────────

async function launchPlaywright({ readyTimeoutMs }) {
  // Both must be set before the import: Playwright resolves its browser
  // registry as the module loads.
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD ??= '1';
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return null;
  }

  const executablePath = process.env.CHROME_PATH || undefined;
  const browser = await chromium.launch({ headless: true, args: CHROME_FLAGS.slice(1), executablePath });
  const context = await browser.newContext();

  return {
    name: `playwright (${process.env.PLAYWRIGHT_BROWSERS_PATH})`,
    async capture(url) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push({ fatal: true, text: String(err?.stack || err) }));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push({ fatal: false, text: msg.text() });
      });
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: readyTimeoutMs });
        await page.waitForSelector('html[data-prerender-ready]', { timeout: readyTimeoutMs });
        const rootFilled = await page.evaluate(ROOT_FILLED_EXPRESSION);
        const html = await page.evaluate(CAPTURE_EXPRESSION);
        return { html, errors, rootFilled };
      } finally {
        await page.close();
      }
    },
    async close() {
      await context.close();
      await browser.close();
    },
  };
}

// ── Chrome DevTools Protocol ─────────────────────────────────────────────────

class CdpConnection {
  #ws;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Set();

  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const conn = new CdpConnection(ws);
      ws.onopen = () => resolve(conn);
      ws.onerror = () => reject(new Error(`Could not connect to Chrome at ${url}`));
    });
  }

  constructor(ws) {
    this.#ws = ws;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined) {
        const waiter = this.#pending.get(msg.id);
        if (!waiter) return;
        this.#pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else waiter.resolve(msg.result);
        return;
      }
      for (const listener of this.#listeners) listener(msg);
    };
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify(payload));
    });
  }

  on(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close() {
    this.#ws.close();
  }
}

/** Start Chrome and wait for it to announce its DevTools endpoint. */
function spawnChrome(executable, userDataDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      executable,
      [...CHROME_FLAGS, '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Chrome did not report a DevTools endpoint within 30s.\n${stderr}`));
    }, 30_000);

    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ proc, wsUrl: match[1] });
      }
    });

    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited with code ${code} before starting.\n${stderr}`));
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function launchCdp({ readyTimeoutMs, idleMs }) {
  const executable = findChrome();
  if (!executable) return null;

  const userDataDir = await mkdtemp(join(tmpdir(), 'pronoun-prerender-'));
  const { proc, wsUrl } = await spawnChrome(executable, userDataDir);
  const cdp = await CdpConnection.connect(wsUrl);

  async function evaluate(sessionId, expression) {
    const res = await cdp.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  return {
    name: `chrome devtools protocol (${executable})`,

    async capture(url) {
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

      const errors = [];
      let inFlight = 0;
      let lastActivity = Date.now();

      const off = cdp.on((msg) => {
        if (msg.sessionId !== sessionId) return;
        switch (msg.method) {
          case 'Network.requestWillBeSent':
            inFlight += 1;
            lastActivity = Date.now();
            break;
          case 'Network.loadingFinished':
          case 'Network.loadingFailed':
            inFlight = Math.max(0, inFlight - 1);
            lastActivity = Date.now();
            break;
          case 'Runtime.exceptionThrown':
            errors.push({
              fatal: true,
              text: msg.params.exceptionDetails?.exception?.description
                ?? msg.params.exceptionDetails?.text
                ?? 'uncaught exception',
            });
            break;
          case 'Runtime.consoleAPICalled':
            if (msg.params.type === 'error') {
              errors.push({
                fatal: false,
                text: msg.params.args.map((a) => a.description ?? a.value ?? a.type).join(' '),
              });
            }
            break;
          default:
        }
      });

      try {
        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Network.enable', {}, sessionId);
        await cdp.send('Page.navigate', { url }, sessionId);

        // Network idle alone races the app — the fetch is fired from an effect
        // after first paint, so there is a quiet moment before it starts. Both
        // conditions have to hold at once.
        const deadline = Date.now() + readyTimeoutMs;
        for (;;) {
          // A commit mid-poll destroys the execution context; that is "not
          // ready yet", not a failure.
          const ready = await evaluate(sessionId, READY_EXPRESSION).catch(() => false);
          const idle = inFlight === 0 && Date.now() - lastActivity >= idleMs;
          if (ready && idle) break;
          if (Date.now() > deadline) {
            throw new Error(
              `timed out after ${readyTimeoutMs}ms waiting for `
              + `${ready ? '' : 'data-prerender-ready'}${!ready && !idle ? ' and ' : ''}`
              + `${idle ? '' : `network idle (${inFlight} in flight)`}`,
            );
          }
          await sleep(100);
        }

        const rootFilled = await evaluate(sessionId, ROOT_FILLED_EXPRESSION);
        const html = await evaluate(sessionId, CAPTURE_EXPRESSION);
        return { html, errors, rootFilled };
      } finally {
        off();
        await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
      }
    },

    async close() {
      cdp.close();
      proc.kill();
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function launchBrowser({ readyTimeoutMs = 45_000, idleMs = 600 } = {}) {
  const driver = (await launchPlaywright({ readyTimeoutMs }))
    ?? (await launchCdp({ readyTimeoutMs, idleMs }));

  if (!driver) {
    throw new Error(
      'No headless browser available.\n'
      + '  Install Playwright and point PLAYWRIGHT_BROWSERS_PATH at its browsers\n'
      + '  (default /opt/pw-browsers), or set CHROME_PATH to a Chrome/Chromium binary.\n'
      + `  Looked for: ${CHROME_CANDIDATES.join(', ')}`,
    );
  }
  return driver;
}
