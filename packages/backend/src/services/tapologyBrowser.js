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
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Titles Cloudflare shows while challenging. If the <title> still matches this
// after navigation, the real page has not loaded yet.
const CHALLENGE_RE = /just a moment|attention required|verifying you are human|performing security verification|checking (your|if the)/i;

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

  // 1. Explicit override (set this on CI if Chrome lives somewhere unusual).
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return puppeteer.launch({ ...base, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH });
  }

  // 2. The locally-installed Google Chrome (NOT bundled Chromium — Cloudflare
  //    blocks Chromium). Present on GitHub's ubuntu-latest runners + dev boxes.
  try {
    return await puppeteer.launch({ ...base, channel: 'chrome' });
  } catch (channelErr) {
    // 3. Fall back to well-known Linux Chrome paths before giving up.
    const fs = require('fs');
    for (const p of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome']) {
      if (fs.existsSync(p)) return puppeteer.launch({ ...base, executablePath: p });
    }
    throw channelErr;
  }
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
  CHALLENGE_RE,
  DEFAULT_UA,
};
