/**
 * UFC.com Event Preview Fetcher (Puppeteer)
 *
 * Fetches https://www.ufc.com/event/<slug> and returns a compact text excerpt
 * of the page's main content (article copy, fight-card storylines, "how to
 * watch" line, etc.) for downstream LLM enrichment.
 *
 * Why Puppeteer (not axios/curl):
 *   ufc.com sits behind anti-bot protection that JA3-fingerprints the TLS
 *   handshake. Node's OpenSSL stack and Linux curl's OpenSSL both 403.
 *   Puppeteer with the stealth plugin uses a real Chrome TLS handshake. Same
 *   pattern as `scrapeUFCAthleteHeadshot.ts`.
 *
 * Design — browser/page reuse:
 *   Callers should call `launchPreviewBrowser()` once, reuse the returned
 *   handle across many event URLs, then `closePreviewBrowser()` at the end.
 *   Launching Puppeteer per fetch is ~2s and ~150MB.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteer = require('puppeteer-extra');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

import type { Browser, Page } from 'puppeteer';

const PAGE_TIMEOUT_MS = 30_000;
const TEXT_CAP_BYTES = 12_000;

export interface PreviewBrowserHandle {
  browser: Browser;
  page: Page;
}

export interface UFCEventPreviewSnapshot {
  url: string;
  finalUrl: string;
  text: string;
  fetchedAt: Date;
}

export async function launchPreviewBrowser(): Promise<PreviewBrowserHandle> {
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
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (type === 'image' || type === 'font' || type === 'media' || type === 'stylesheet') {
      req.abort();
    } else {
      req.continue();
    }
  });
  return { browser, page };
}

export async function closePreviewBrowser(handle: PreviewBrowserHandle): Promise<void> {
  try { await handle.page.close(); } catch { /* noop */ }
  try { await handle.browser.close(); } catch { /* noop */ }
}

export async function fetchUFCEventPreview(
  eventUrl: string,
  handle: PreviewBrowserHandle,
): Promise<UFCEventPreviewSnapshot | null> {
  let response;
  try {
    response = await handle.page.goto(eventUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });
  } catch (err: any) {
    console.warn(`[aiEnrichment.ufcPreview] navigation failed for ${eventUrl}: ${err?.message}`);
    return null;
  }

  const statusCode = response?.status() ?? 0;
  const finalUrl = handle.page.url();

  if (statusCode >= 400) {
    console.warn(`[aiEnrichment.ufcPreview] ${eventUrl} returned HTTP ${statusCode}`);
    return null;
  }

  // Pull the rendered text after dropping noise. Done inside the page so we
  // don't ship the full HTML back to Node.
  const text = await handle.page.evaluate((cap: number) => {
    const drop = (sel: string) => document.querySelectorAll(sel).forEach((el) => el.remove());
    drop('script, style, noscript, svg, form, iframe');
    drop('nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]');
    drop('.cookie-banner, .ad, .ads, [class*="advertis" i]');

    const root =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const raw = (root.textContent || '').replace(/\s+/g, ' ').trim();
    return raw.slice(0, cap);
  }, TEXT_CAP_BYTES);

  if (!text || text.length < 200) {
    console.warn(`[aiEnrichment.ufcPreview] ${eventUrl} produced only ${text?.length ?? 0} chars`);
    return null;
  }

  return { url: eventUrl, finalUrl, text, fetchedAt: new Date() };
}
