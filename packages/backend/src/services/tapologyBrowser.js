/**
 * Shared Tapology browser launcher — defeats Cloudflare bot protection.
 *
 * WHY THIS EXISTS
 * Around 2026-06-11 Tapology put every page behind a Cloudflare "Just a
 * moment..." / "Performing security verification" JS interstitial. Plain
 * puppeteer driving its BUNDLED Chromium gets a hard 403 + the challenge page,
 * so EVERY Tapology scraper/tracker/backfill silently extracted 0 fights and
 * the daily jobs all "failed" at once. (Previously Tapology only did JA3/TLS
 * fingerprinting, which a real headless Chrome passed — see
 * lesson_ufc_com_ja3_blocking. This is a strictly harder, JS-challenge layer.)
 *
 * THE FIX
 * The interstitial auto-solves in a REAL Chrome build (NOT bundled Chromium)
 * with the stealth plugin + the AutomationControlled flag masked. We launch
 * system Chrome (channel:'chrome', or PUPPETEER_EXECUTABLE_PATH on CI), then
 * poll the page title until the interstitial clears before the caller reads
 * the DOM.
 *
 * ESCALATION CAVEAT
 * Cloudflare escalates to an effectively-unsolvable managed challenge after
 * many rapid hits from a single IP. Low-frequency DAILY scrapers (a handful of
 * page loads per org, once a day, with delays) stay under that threshold.
 * High-frequency LIVE-TRACKER polling can trip it — set TAPOLOGY_PROXY to a
 * residential/unblocker proxy for those if they start getting blocked.
 * See docs/areas/scrapers.md.
 *
 * Used by every scrape*Tapology.js, tapologyLiveScraper.ts, and
 * backfillTapologyResults.ts. Single source of truth for the launch recipe.
 */
const https = require('https');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Titles Cloudflare shows while challenging. If the <title> still matches this
// after navigation, the real page has not loaded yet.
const CHALLENGE_RE = /just a moment|attention required|verifying you are human|performing security verification|checking (your|if the)/i;

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─────────────────────────── Residential proxy path ──────────────────────────
// The CHEAP, durable alternative to Scrapfly: run the real-Chrome+stealth recipe
// THROUGH a residential rotating proxy (e.g. DataImpulse ~$1-5/mo) so Cloudflare
// sees a residential IP and the JS/Turnstile challenge auto-solves in-browser,
// exactly as it does on a home IP — but from CI/VPS. Cloudflare binds
// cf_clearance to IP+UA+TLS, so the WHOLE browser must run through the proxy
// (you can't solve elsewhere and relay the cookie). See
// project_tapology_scraping_provider_research.
//
// Set TAPOLOGY_PROXY to the proxy URL, credentials inline:
//   TAPOLOGY_PROXY=http://USER:PASS@gw.dataimpulse.com:823
// Chrome's --proxy-server flag CANNOT carry credentials, so we split them out
// here and apply them per-page via page.authenticate(). Leave SCRAPFLY_KEY unset
// when using the proxy (Scrapfly wrapping overrides goto and would bypass it).
function parseTapologyProxy() {
  const raw = process.env.TAPOLOGY_PROXY;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const auth = u.username ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password || '') } : null;
    // --proxy-server wants protocol+host+port only (no creds, no trailing slash)
    const server = `${u.protocol}//${u.host}`;
    return { server, auth };
  } catch (_) {
    // Bare host:port (no scheme/creds) — pass through as-is, assume http.
    return { server: raw, auth: null };
  }
}

// ───────────────────────────── Scrapfly path ─────────────────────────────
// The real-Chrome+stealth recipe above defeats Cloudflare's challenge ONLY from
// a residential IP. From a DATACENTER IP (GitHub Actions runners, the Hetzner
// VPS) Cloudflare escalates to an interactive Turnstile widget that no headless
// browser can solve — which is why every Tapology daily scrape / live track /
// backfill broke at once around 2026-06-11. Scrapfly's "Web Unlocker" (asp=true)
// solves Turnstile SERVER-SIDE on its own residential pool and hands back the
// rendered HTML, so it works from any IP.
//
// Activation is purely env-driven: set SCRAPFLY_KEY (CI secret + VPS + Render)
// and every page.goto() to a tapology.com URL is transparently routed through
// Scrapfly (see wrapBrowserForScrapfly). Leave it unset (local/residential dev)
// and the original real-Chrome path runs unchanged. No consumer code changes.
// See docs/areas/scrapers.md.
const SCRAPFLY_API = 'https://api.scrapfly.io/scrape';
const TAPOLOGY_BASE = 'https://www.tapology.com/';
const SCRAPFLY_TIMEOUT_MS = Number(process.env.SCRAPFLY_TIMEOUT_MS || 120000);

function isScrapflyEnabled() {
  return !!process.env.SCRAPFLY_KEY;
}

/**
 * Fetch a URL's fully-rendered HTML through Scrapfly. `asp=true` is the
 * anti-scraping-protection bypass that solves Cloudflare/Turnstile; `render_js`
 * runs the page's JS (Tapology is mostly server-rendered, but it's cheap on the
 * request-metered free plan and adds robustness). Resolves to the HTML string,
 * rejects on any non-success so callers hit their existing retry/fail-closed
 * paths instead of silently parsing an error page.
 */
function scrapflyFetchHtml(url, { renderJs = true, country = 'us', timeoutMs = SCRAPFLY_TIMEOUT_MS } = {}) {
  const key = process.env.SCRAPFLY_KEY;
  if (!key) return Promise.reject(new Error('SCRAPFLY_KEY not set'));
  const params = new URLSearchParams({
    key,
    url,
    asp: 'true',
    render_js: renderJs ? 'true' : 'false',
    country,
  });
  const apiUrl = `${SCRAPFLY_API}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const req = https.get(apiUrl, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let json;
        try {
          json = JSON.parse(body);
        } catch (_) {
          return reject(new Error(`Scrapfly: non-JSON response (HTTP ${res.statusCode}): ${body.slice(0, 200)}`));
        }
        const result = json.result || {};
        if (res.statusCode !== 200 || result.success === false) {
          const msg = json.message || result.error || `HTTP ${res.statusCode}`;
          return reject(new Error(`Scrapfly request failed for ${url}: ${msg}`));
        }
        const html = result.content || '';
        if (html.length < 500) {
          return reject(new Error(`Scrapfly returned empty/short content for ${url} (len ${html.length}, upstream ${result.status_code})`));
        }
        resolve(html);
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Scrapfly request timed out after ${timeoutMs}ms for ${url}`)));
  });
}

const BASE_TAG = `<base href="${TAPOLOGY_BASE}">`;
/**
 * Scrapfly returns the rendered DOM, which we load via page.setContent — but
 * then the page URL is about:blank, so the scrapers' `link.href` reads would
 * resolve relative event links (/fightcenter/events/…) against about:blank and
 * break. Inject a <base> so href resolution (and any relative asset) points at
 * tapology.com, exactly as on the live page.
 */
function withTapologyBase(html) {
  if (/<base\s/i.test(html)) return html; // respect an existing base tag
  const headOpen = html.match(/<head[^>]*>/i);
  if (headOpen) return html.replace(headOpen[0], `${headOpen[0]}${BASE_TAG}`);
  return `${BASE_TAG}${html}`;
}

/**
 * Wrap a launched browser so every page.goto() to a tapology.com URL is served
 * by Scrapfly + setContent instead of a real navigation. Non-Tapology URLs
 * (e.g. mostvaluablepromotions.com in the MVP scraper) pass straight through.
 * Transparent to all callers — they still call page.goto + waitForCloudflareClear,
 * and the clear check passes instantly because setContent shows the real title.
 */
function wrapBrowserForScrapfly(browser) {
  const origNewPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const page = await origNewPage(...a);
    const origGoto = page.goto.bind(page);
    page.goto = async (url, gotoOpts = {}) => {
      if (typeof url === 'string' && /tapology\.com/i.test(url)) {
        const html = withTapologyBase(await scrapflyFetchHtml(url, { renderJs: true }));
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: gotoOpts.timeout || 60000 });
        return { status: () => 200, ok: () => true, _viaScrapfly: true };
      }
      return origGoto(url, gotoOpts);
    };
    return page;
  };
  return browser;
}
// ──────────────────────────── end Scrapfly path ──────────────────────────

// ─────────────────────────────── CapSolver path ──────────────────────────────
// Around 2026-06-17 Tapology escalated to an INTERACTIVE Cloudflare Turnstile
// that no stealth browser auto-solves — verified headless AND headful, on
// datacenter AND residential IPs (the checkbox always appears). The cheap
// durable fix: a STICKY residential proxy (TAPOLOGY_PROXY w/ a DataImpulse
// sessid) + CapSolver's AntiCloudflareTask. CapSolver solves the challenge
// THROUGH the same sticky IP and returns a cf_clearance cookie + the UA it used.
// cf_clearance is bound to IP+UA, so we set both on the page (the browser already
// egresses via that sticky IP through the proxy) and reload → cleared.
// Env-gated on CAPSOLVER_KEY; requires a sticky TAPOLOGY_PROXY.
const CAPSOLVER_API = 'https://api.capsolver.com';
const CAPSOLVER_TIMEOUT_MS = Number(process.env.CAPSOLVER_TIMEOUT_MS || 120000);

function isCapsolverEnabled() {
  return !!process.env.CAPSOLVER_KEY;
}

function capsolverPostJson(path, payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${CAPSOLVER_API}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            resolve(JSON.parse(text));
          } catch (_) {
            reject(new Error(`CapSolver: non-JSON response (HTTP ${res.statusCode}): ${text.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(CAPSOLVER_TIMEOUT_MS, () => req.destroy(new Error('CapSolver request timed out')));
    req.end(body);
  });
}

// CapSolver wants the proxy as "host:port:user:pass" so it solves from the SAME
// sticky residential IP the browser uses (cf_clearance is IP-bound).
function capsolverProxyString() {
  const p = parseTapologyProxy();
  if (!p) throw new Error('CapSolver requires a sticky TAPOLOGY_PROXY (none set)');
  const hostPort = p.server.replace(/^\w+:\/\//, ''); // strip scheme → host:port
  return p.auth ? `${hostPort}:${p.auth.username}:${p.auth.password}` : hostPort;
}

/** Solve a Cloudflare challenge for `websiteURL`; resolves {cfClearance, userAgent}. */
async function capsolverSolveCloudflare(websiteURL) {
  const clientKey = process.env.CAPSOLVER_KEY;
  const create = await capsolverPostJson('/createTask', {
    clientKey,
    task: { type: 'AntiCloudflareTask', websiteURL, proxy: capsolverProxyString(), userAgent: DEFAULT_UA },
  });
  if (create.errorId) throw new Error(`CapSolver createTask: ${create.errorCode || ''} ${create.errorDescription || ''}`.trim());
  const taskId = create.taskId;
  const deadline = Date.now() + CAPSOLVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await capsolverPostJson('/getTaskResult', { clientKey, taskId });
    if (res.errorId) throw new Error(`CapSolver getTaskResult: ${res.errorCode || ''} ${res.errorDescription || ''}`.trim());
    if (res.status === 'ready') {
      const sol = res.solution || {};
      const cf = sol.cookies && sol.cookies.cf_clearance;
      if (!cf) throw new Error('CapSolver solution missing cf_clearance');
      return { cfClearance: cf, userAgent: sol.userAgent || DEFAULT_UA };
    }
  }
  throw new Error('CapSolver solve timed out');
}

/**
 * Solve the Cloudflare challenge blocking the page's current URL, apply the
 * cf_clearance cookie + the solver's UA, and reload. Returns true if the reload
 * shows the real page. Never used unless CAPSOLVER_KEY is set.
 */
async function applyCapsolverClearance(page) {
  const url = page.url();
  console.log(`[capsolver] solving challenge for ${url}`);
  const { cfClearance, userAgent } = await capsolverSolveCloudflare(url);
  console.log(`[capsolver] solved (cf_clearance ${cfClearance.length} chars, ua "${userAgent.slice(0, 32)}…"), applying + reloading`);
  await page.setUserAgent(userAgent);
  await page.setCookie({ name: 'cf_clearance', value: cfClearance, domain: '.tapology.com', path: '/', httpOnly: true, secure: true });
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => console.log(`[capsolver] reload error: ${e.message}`));
  const title = await page.title().catch(() => '');
  const cleared = !!title && !CHALLENGE_RE.test(title);
  console.log(`[capsolver] post-reload title="${title}" cleared=${cleared}`);
  return cleared;
}
// ───────────────────────────── end CapSolver path ────────────────────────────

/**
 * Launch a Cloudflare-resistant browser. Prefers a real system Chrome:
 *   - PUPPETEER_EXECUTABLE_PATH (set on CI to /usr/bin/google-chrome-stable), else
 *   - channel:'chrome' (the locally installed Google Chrome).
 * Bundled Chromium is intentionally NOT used — Cloudflare blocks it.
 */
async function launchTapologyBrowser(opts = {}) {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080',
    ...(opts.args || []),
  ];
  const proxy = parseTapologyProxy();
  if (proxy) {
    args.push(`--proxy-server=${proxy.server}`);
  }

  const base = { headless: true, ...opts, args };

  let browser;
  // 1. Explicit override (set this on CI if Chrome lives somewhere unusual).
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    browser = await puppeteer.launch({ ...base, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH });
  } else {
    // 2. The locally-installed Google Chrome (NOT bundled Chromium — Cloudflare
    //    blocks Chromium). Present on GitHub's ubuntu-latest runners + dev boxes.
    try {
      browser = await puppeteer.launch({ ...base, channel: 'chrome' });
    } catch (channelErr) {
      // 3. Fall back to well-known Linux Chrome paths before giving up.
      const fs = require('fs');
      let exe = null;
      for (const p of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome']) {
        if (fs.existsSync(p)) { exe = p; break; }
      }
      if (!exe) throw channelErr;
      browser = await puppeteer.launch({ ...base, executablePath: exe });
    }
  }

  // When SCRAPFLY_KEY is set, route tapology.com navigations through Scrapfly.
  // The launched browser is then only a local DOM host for setContent — it
  // never touches Cloudflare, so even bundled Chromium would do here.
  if (isScrapflyEnabled()) return wrapBrowserForScrapfly(browser);
  // Otherwise, if TAPOLOGY_PROXY carries credentials, authenticate EVERY page —
  // --proxy-server can't carry creds, and scrapers call browser.newPage()
  // directly (not just newTapologyPage), so the auth must live at this level or
  // navigations fail with net::ERR_INVALID_AUTH_CREDENTIALS.
  if (proxy && proxy.auth) return wrapBrowserForProxy(browser, proxy.auth);
  return browser;
}

/** Wrap a browser so every newPage() authenticates to the residential proxy. */
function wrapBrowserForProxy(browser, auth) {
  const origNewPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const page = await origNewPage(...a);
    await page.authenticate(auth);
    return page;
  };
  return browser;
}

/** A page pre-set with a realistic viewport + desktop Chrome UA. */
async function newTapologyPage(browser) {
  const page = await browser.newPage();
  // Authenticate to the residential proxy (DataImpulse etc.) before any goto.
  // Skipped when Scrapfly is active (it serves HTML via setContent, no proxy)
  // or when the proxy is credential-less.
  if (!isScrapflyEnabled()) {
    const proxy = parseTapologyProxy();
    if (proxy && proxy.auth) await page.authenticate(proxy.auth);
  }
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(DEFAULT_UA);
  return page;
}

/**
 * After a navigation, poll until Cloudflare's interstitial clears. Returns true
 * once the real page <title> is showing, false if still challenged at timeout.
 * Never throws — callers decide how to handle a non-clear (usually their own
 * fail-closed / 0-fight path).
 */
async function waitForCloudflareClear(page, { timeoutMs = 120000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let triedCapsolver = false;
  while (Date.now() < deadline) {
    let title = '';
    try {
      title = await page.title();
    } catch (_) {
      // navigation/redirect in flight — keep polling
    }
    if (title && !CHALLENGE_RE.test(title)) return true;
    // Tapology's interactive Turnstile never auto-solves — hand it to CapSolver
    // once (it returns cf_clearance for our sticky proxy IP, applied + reloaded).
    if (!triedCapsolver && isCapsolverEnabled() && title && CHALLENGE_RE.test(title)) {
      triedCapsolver = true;
      try {
        if (await applyCapsolverClearance(page)) return true;
      } catch (e) {
        console.log(`[capsolver] solve failed: ${e.message}`);
        // keep polling until the overall timeout, then fail closed
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * goto + clear the Cloudflare challenge in one call. Throws if the challenge
 * never clears (so high-frequency callers surface the escalation instead of
 * silently scraping the interstitial). Returns the navigation response.
 */
async function gotoTapology(page, url, gotoOpts = {}) {
  const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000, ...gotoOpts });
  const cleared = await waitForCloudflareClear(page);
  if (!cleared) {
    const status = resp ? resp.status() : '?';
    throw new Error(
      `Cloudflare challenge did not clear for ${url} (status ${status}). ` +
        `Tapology bot protection likely escalated for this IP — consider TAPOLOGY_PROXY (residential).`
    );
  }
  return resp;
}

/**
 * One-shot: launch, navigate, clear the challenge, return the page HTML, close.
 * For callers that just need the rendered HTML (e.g. cheerio parsing) instead of
 * driving a live Page. Throws if the challenge never clears.
 */
async function fetchTapologyHtml(url, { waitForSelector, gotoOpts } = {}) {
  const browser = await launchTapologyBrowser();
  try {
    const page = await newTapologyPage(browser);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000, ...(gotoOpts || {}) });
    const cleared = await waitForCloudflareClear(page);
    if (!cleared) {
      throw new Error(`Cloudflare challenge did not clear for ${url} — bot protection may have escalated for this IP.`);
    }
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 30000 }).catch(() => {});
    }
    return await page.content();
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = {
  launchTapologyBrowser,
  newTapologyPage,
  waitForCloudflareClear,
  gotoTapology,
  fetchTapologyHtml,
  isScrapflyEnabled,
  scrapflyFetchHtml,
  isCapsolverEnabled,
  capsolverSolveCloudflare,
  CHALLENGE_RE,
  DEFAULT_UA,
};
