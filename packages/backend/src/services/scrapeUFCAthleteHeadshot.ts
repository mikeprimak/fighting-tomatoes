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
  // og:title of the page UFC.com served. We use this to verify the page
  // is actually about the requested fighter — UFC.com sometimes redirects
  // unknown slugs to a generic fallback page with another fighter's image,
  // which previously caused us to write wrong photos to DB rows.
  pageTitle?: string;
}

export function isSilhouettePlaceholderUrl(url: string): boolean {
  return /SILHOUETTE\.png/i.test(url);
}

function normalizeForCompare(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`.]/g, '')
    .replace(/[^a-z0-9 -]/g, ' ')
    .split(/[\s-]+/)
    .filter(t => t.length >= 2 && !/^(jr|sr|ii|iii|iv|v)$/i.test(t));
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = [...curr];
  }
  return prev[n];
}

/**
 * Verify a scraped UFC page is actually about the fighter we were looking for.
 * Compares tokens from the DB fighter name against tokens from the UFC page's
 * og:title (and falls back to the slug if title is missing).
 *
 * Pass rule: at least one DB token must match a page-side token with
 * Levenshtein distance ≤ 1, AND that token must be ≥ 4 chars (avoid spurious
 * matches on common short fragments like "de", "da", "san").
 *
 * This catches the corrupting case (DDG returned slug "tamia-hasohitsuku"
 * for "Polo Reyes", UFC.com served Damir Hadzovic's photo — page title was
 * "Damir Hadzovic", zero token overlap with "Polo Reyes" → reject).
 */
export function isHeadshotTrustworthy(
  dbName: string,
  pageTitle: string | undefined,
  slug: string,
): boolean {
  const dbTokens = normalizeForCompare(dbName);
  if (dbTokens.length === 0) return false;
  // Prefer the page title (server-side truth). Fall back to the slug if
  // og:title is missing — but slug-only matching is weaker, so require a
  // stricter rule (exact token match, no fuzzy).
  const titleStr = (pageTitle || '').replace(/\s*\|\s*UFC\s*$/i, '').trim();
  const pageTokens = titleStr
    ? normalizeForCompare(titleStr)
    : normalizeForCompare(slug.replace(/-/g, ' '));

  for (const dbT of dbTokens) {
    if (dbT.length < 4) continue;
    for (const pT of pageTokens) {
      if (pT.length < 4) continue;
      // If we only have the slug to compare against, require exact match.
      if (!titleStr) {
        if (dbT === pT) return true;
      } else {
        if (lev(dbT, pT) <= 1) return true;
      }
    }
  }
  return false;
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

    const meta = await page.evaluate(() => {
      const img = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;
      const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null;
      return { img, title };
    });

    if (!meta.img) {
      return { status: 'no-image', finalUrl, pageTitle: meta.title || undefined };
    }
    const trimmed = meta.img.trim();
    return {
      status: 'ok',
      imageUrl: trimmed,
      finalUrl,
      isPlaceholder: isSilhouettePlaceholderUrl(trimmed),
      pageTitle: meta.title || undefined,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Find the canonical UFC.com athlete slug via Brave Search API. Replaces
 * the earlier DDG scrape which (a) blocked us on AWS / GH Actions IP ranges
 * for non-browser fingerprints and (b) returned unrelated slugs for some
 * queries with no way to validate from the result alone — UFC.com then
 * served generic fallback pages with the wrong fighter's photo, corrupting
 * DB rows. Brave's web/search endpoint returns structured JSON, supports
 * any IP, and respects rate limits cleanly.
 *
 * Auth: requires BRAVE_SEARCH_API_KEY env var. Free tier covers 2000
 * queries/month at 1 req/sec — fine for the 500-fighter backfill.
 *
 * Validation still happens downstream: the caller fetches the UFC.com page
 * for the returned slug and runs `isHeadshotTrustworthy` against og:title
 * before writing anything to the DB. Brave is the slug source, not the
 * source of truth.
 */
let braveLastCallAt = 0;
const BRAVE_MIN_INTERVAL_MS = 1100;

async function braveRateLimit(): Promise<void> {
  const now = Date.now();
  const wait = braveLastCallAt + BRAVE_MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  braveLastCallAt = Date.now();
}

export async function searchUFCAthleteSlugViaBrave(
  fighterName: string,
): Promise<string | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    console.warn('[brave] BRAVE_SEARCH_API_KEY not set — skipping search fallback.');
    return null;
  }
  await braveRateLimit();

  const query = encodeURIComponent(`${fighterName} ufc.com athlete`);
  const url = `https://api.search.brave.com/res/v1/web/search?q=${query}&count=10`;

  let json: any;
  try {
    const res = await fetch(url, {
      headers: {
        'X-Subscription-Token': apiKey,
        'Accept': 'application/json',
      },
    });
    if (res.status === 429) {
      // Rate-limited despite our throttle — back off a bit and try once more.
      await new Promise(r => setTimeout(r, 2000));
      braveLastCallAt = Date.now();
      const retry = await fetch(url, {
        headers: { 'X-Subscription-Token': apiKey, 'Accept': 'application/json' },
      });
      if (!retry.ok) return null;
      json = await retry.json();
    } else if (!res.ok) {
      return null;
    } else {
      json = await res.json();
    }
  } catch {
    return null;
  }

  const results: Array<{ url?: string }> = json?.web?.results || [];
  for (const r of results) {
    const m = (r.url || '').match(/https?:\/\/(?:[a-z]{2,3}\.)?ufc\.com\/athlete\/([a-z0-9-]+)/i);
    if (m && m[1]) return m[1].toLowerCase();
  }
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
