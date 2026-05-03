/**
 * UFC.com Athlete Headshot Scraper (Puppeteer)
 *
 * Fetches https://www.ufc.com/athlete/<slug> and extracts the canonical
 * headshot URL from the page's <meta property="og:image"> tag.
 *
 * Why Puppeteer (not axios/curl):
 *   ufc.com sits behind anti-bot protection that JA3-fingerprints the TLS
 *   handshake. Node's OpenSSL stack and Linux curl's OpenSSL both 403.
 *   Windows curl (Schannel) happens to pass, which masked the issue during
 *   local dev. Puppeteer with the stealth plugin uses a real Chrome TLS
 *   handshake and is the same pattern the existing daily UFC scraper
 *   (`scrapeAllUFCData.js`) uses to access the same site on GH Actions.
 *
 * Design — browser/page reuse:
 *   Launching Puppeteer is expensive (~2s) and consumes ~150MB. A 1,470-
 *   fighter sweep that launches once per fighter would take 50+ minutes and
 *   thrash memory. Callers should call `launchAthleteBrowser()` once,
 *   reuse the returned `{ browser, page }`, and call `closeAthleteBrowser()`
 *   at the end. Each `fetchUFCAthleteHeadshot()` call only navigates the
 *   shared page — order of magnitude faster.
 */

// puppeteer-extra and stealth plugin lack TypeScript types in this repo,
// but the .js call surface is well-understood and matches puppeteer's.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteer = require('puppeteer-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

import type { Browser, Page } from 'puppeteer';

const PAGE_TIMEOUT_MS = 25_000;

export interface AthleteBrowserHandle {
  browser: Browser;
  page: Page;
}

export async function launchAthleteBrowser(): Promise<AthleteBrowserHandle> {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US,en',
    ],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });
  // Block heavy assets we don't need for the meta-tag read — speeds each
  // page load substantially and reduces bandwidth.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
      req.abort();
    } else {
      req.continue();
    }
  });
  return { browser, page };
}

export async function closeAthleteBrowser(handle: AthleteBrowserHandle): Promise<void> {
  try {
    await handle.page.close();
  } catch { /* noop */ }
  try {
    await handle.browser.close();
  } catch { /* noop */ }
}

export interface UFCHeadshotResult {
  status: 'ok' | 'no-page' | 'no-image' | 'error';
  imageUrl?: string;
  finalUrl?: string;
  errorMessage?: string;
}

export async function fetchUFCAthleteHeadshot(
  slug: string,
  handle: AthleteBrowserHandle,
): Promise<UFCHeadshotResult> {
  const url = `https://www.ufc.com/athlete/${encodeURIComponent(slug)}`;
  let response;
  try {
    response = await handle.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });
  } catch (err: any) {
    return { status: 'error', errorMessage: err.message, finalUrl: url };
  }

  const statusCode = response?.status() ?? 0;
  const finalUrl = handle.page.url();

  if (statusCode === 404 || statusCode === 410) {
    return { status: 'no-page', finalUrl };
  }
  if (statusCode >= 400) {
    return { status: 'error', errorMessage: `HTTP ${statusCode}`, finalUrl };
  }

  // Read og:image directly off the document; cheaper than serializing HTML.
  const ogImage = await handle.page.evaluate(() => {
    const m = document.querySelector('meta[property="og:image"]');
    return m ? m.getAttribute('content') : null;
  });

  if (!ogImage) {
    return { status: 'no-image', finalUrl };
  }
  return { status: 'ok', imageUrl: ogImage.trim(), finalUrl };
}

/**
 * Derive a likely ufc.com athlete slug from a fighter's display name.
 *   "Conor McGregor"           → "conor-mcgregor"
 *   "Israel Adesanya"          → "israel-adesanya"
 *   "Jose Aldo Jr."            → "jose-aldo-jr"
 *
 * The actual canonical slugs may differ (UFC.com uses curated slugs with
 * occasional disambiguation suffixes). Callers should treat this as a
 * best-guess; verify by fetching the page and checking the result.
 */
export function deriveUFCAthleteSlug(fullName: string): string {
  return fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/['’‘`.]/g, '')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
