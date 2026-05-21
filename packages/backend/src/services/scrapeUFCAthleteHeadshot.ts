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
 * Design — browser reuse, page-per-fetch:
 *   Launching Puppeteer is expensive (~2s) so callers should share one
 *   browser across many fetches. BUT reusing a single page across many
 *   navigations causes the stealth plugin's protocol channel to accumulate
 *   state and eventually time out (Page.addScriptToEvaluateOnNewDocument).
 *   The proven daily UFC scraper (`scrapeAllUFCData.js`) opens a fresh
 *   page per athlete and closes it after; we match that pattern here.
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
}

export async function launchAthleteBrowser(): Promise<AthleteBrowserHandle> {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 240_000,
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
  return { browser };
}

export async function closeAthleteBrowser(handle: AthleteBrowserHandle): Promise<void> {
  try {
    await handle.browser.close();
  } catch { /* noop */ }
}

export interface UFCHeadshotResult {
  status: 'ok' | 'no-page' | 'no-image' | 'error';
  imageUrl?: string;
  finalUrl?: string;
  errorMessage?: string;
  // True when og:image points at UFC.com's generic silhouette placeholder
  // (https://ufc.com/images/.../SILHOUETTE.png). Caller decides whether to
  // use it (low-tier fighters who'll never get a real photo) or skip it.
  isPlaceholder?: boolean;
}

export function isSilhouettePlaceholderUrl(url: string): boolean {
  return /SILHOUETTE\.png/i.test(url);
}

export async function fetchUFCAthleteHeadshot(
  slug: string,
  handle: AthleteBrowserHandle,
): Promise<UFCHeadshotResult> {
  const url = `https://www.ufc.com/athlete/${encodeURIComponent(slug)}`;
  const page = await handle.browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });

    let response;
    try {
      response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT_MS,
      });
    } catch (err: any) {
      return { status: 'error', errorMessage: err.message, finalUrl: url };
    }

    const statusCode = response?.status() ?? 0;
    const finalUrl = page.url();

    if (statusCode === 404 || statusCode === 410) {
      return { status: 'no-page', finalUrl };
    }
    if (statusCode >= 400) {
      return { status: 'error', errorMessage: `HTTP ${statusCode}`, finalUrl };
    }

    const ogImage = await page.evaluate(() => {
      const m = document.querySelector('meta[property="og:image"]');
      return m ? m.getAttribute('content') : null;
    });

    if (!ogImage) {
      return { status: 'no-image', finalUrl };
    }
    const trimmed = ogImage.trim();
    return {
      status: 'ok',
      imageUrl: trimmed,
      finalUrl,
      isPlaceholder: isSilhouettePlaceholderUrl(trimmed),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Find the canonical UFC.com athlete slug for a fighter name we can't
 * resolve via derived-from-name guessing (e.g. "Khalil Rountree" really
 * lives at `khalil-rountree-jr`; "Paulo Borrachinha" lives at `paulo-costa`).
 *
 * Implementation: DuckDuckGo HTML search via plain HTTP — `html.duckduckgo.com`
 * is server-rendered and parses fine without a real browser. Skipping
 * Puppeteer here saves ~2-3s per search vs spinning up a page just for
 * the lookup; UFC.com's stealth-required nav still uses Puppeteer.
 *
 * We query `<name> ufc.com athlete` and take the first result whose URL is
 * on any *.ufc.com host with an `/athlete/<slug>` path. Localized subdomains
 * (kr.ufc.com, etc.) share the same slug as www, so we accept them.
 *
 * Returns the slug or null if no usable result was found.
 */
export async function searchUFCAthleteSlugViaDDG(
  fighterName: string,
): Promise<string | null> {
  const query = encodeURIComponent(`${fighterName} ufc.com athlete`);
  const url = `https://html.duckduckgo.com/html/?q=${query}`;

  let html: string;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  // DDG HTML wraps result hrefs in a redirector (//duckduckgo.com/l/?uddg=<urlencoded>...)
  // OR serves raw URLs. Match both: either a uddg-wrapped ufc.com link or a
  // bare ufc.com/athlete/<slug> URL anywhere in the document.
  const uddgMatches = html.matchAll(/[?&]uddg=([^"&]+)/g);
  for (const m of uddgMatches) {
    let resolved: string;
    try { resolved = decodeURIComponent(m[1]); } catch { continue; }
    const ufcMatch = resolved.match(/https?:\/\/(?:[a-z]{2,3}\.)?ufc\.com\/athlete\/([a-z0-9-]+)/i);
    if (ufcMatch && ufcMatch[1]) return ufcMatch[1].toLowerCase();
  }
  // Bare URL fallback
  const bare = html.match(/https?:\/\/(?:[a-z]{2,3}\.)?ufc\.com\/athlete\/([a-z0-9-]+)/i);
  if (bare && bare[1]) return bare[1].toLowerCase();
  return null;
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
