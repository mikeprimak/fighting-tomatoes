/**
 * BKFC event page fetcher.
 *
 * Plain fetch + cheerio — bkfc.com is Webflow-hosted, no anti-bot. Returns a
 * compact text excerpt of the event page (full card with weight classes /
 * championship flags / records, plus the editorial "event spotlight" blurb)
 * for downstream LLM enrichment. Acts as the structured backbone for BKFC
 * events the way ufc.com pages do for UFC events.
 */

import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 15_000;
const TEXT_CAP_BYTES = 12_000;

export interface BkfcEventSnapshot {
  url: string;
  finalUrl: string;
  text: string;
  fetchedAt: Date;
}

export async function fetchBkfcEventPreview(
  bkfcUrl: string,
): Promise<BkfcEventSnapshot | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(bkfcUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[aiEnrichment.bkfc] ${bkfcUrl} returned ${res.status}`);
      return null;
    }
    const html = await res.text();
    const text = extractEventText(html);
    if (!text || text.length < 200) {
      console.warn(`[aiEnrichment.bkfc] ${bkfcUrl} produced only ${text?.length ?? 0} chars`);
      return null;
    }
    return { url: bkfcUrl, finalUrl: res.url, text, fetchedAt: new Date() };
  } catch (err: any) {
    console.warn(`[aiEnrichment.bkfc] ${bkfcUrl} fetch failed:`, err?.message);
    return null;
  }
}

function extractEventText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, form, iframe').remove();
  $('nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
  $('.merchandise, [class*="newsletter" i], [class*="subscribe" i], [class*="shop-now" i]').remove();

  let root = $('main.main-wrapper').first();
  if (root.length === 0) root = $('main').first();
  if (root.length === 0) root = $('body');

  const text = root.text().replace(/\s+/g, ' ').trim();
  return text.slice(0, TEXT_CAP_BYTES);
}
