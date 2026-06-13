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
  if (process.env.TAPOLOGY_PROXY) {
    args.push(`--proxy-server=${process.env.TAPOLOGY_PROXY}`);
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
  return isScrapflyEnabled() ? wrapBrowserForScrapfly(browser) : browser;
}

/** A page pre-set with a realistic viewport + desktop Chrome UA. */
async function newTapologyPage(browser) {
  const page = await browser.newPage();
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
async function waitForCloudflareClear(page, { timeoutMs = 45000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let title = '';
    try {
      title = await page.title();
    } catch (_) {
      // navigation/redirect in flight — keep polling
    }
    if (title && !CHALLENGE_RE.test(title)) return true;
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
  CHALLENGE_RE,
  DEFAULT_UA,
};
