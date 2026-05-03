/**
 * Fetches a promotion's official "how to watch" page (when one exists) and
 * returns a compact text excerpt for the LLM. We don't try to parse —
 * the LLM does the parsing — we just shrink the HTML.
 */

import * as cheerio from 'cheerio';

/** Known landing pages per promotion. Promotions not listed return null. */
const HOW_TO_WATCH_URLS: Record<string, string> = {
  'UFC':              'https://www.ufc.com/how-to-watch',
  'ONE':              'https://www.onefc.com/how-to-watch/',
  'BKFC':             'https://www.bkfc.com/where-to-watch',
  'PFL':              'https://pflmma.com/how-to-watch',
  'Karate Combat':    'https://karate.com/how-to-watch',
  // others omitted — most don't publish a single canonical page
};

const FETCH_TIMEOUT_MS = 15_000;

export interface HowToWatchSnapshot {
  url: string;
  text: string; // ≤ 8 KB excerpt
  fetchedAt: Date;
}

export async function fetchHowToWatch(promotion: string): Promise<HowToWatchSnapshot | null> {
  const url = HOW_TO_WATCH_URLS[promotion];
  if (!url) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GoodFightsBroadcastDiscovery/1.0 (+https://goodfights.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[discovery] ${promotion} how-to-watch returned ${res.status}`);
      return null;
    }
    const html = await res.text();
    return {
      url,
      text: extractMainText(html),
      fetchedAt: new Date(),
    };
  } catch (e: any) {
    console.warn(`[discovery] ${promotion} how-to-watch fetch failed:`, e?.message);
    return null;
  }
}

function extractMainText(html: string): string {
  const $ = cheerio.load(html);
  // Drop noise.
  $('script, style, nav, header, footer, noscript, svg, form').remove();
  // Prefer main/article/role=main if present.
  let root = $('main, article, [role="main"]').first();
  if (root.length === 0) root = $('body');
  const text = root.text().replace(/\s+/g, ' ').trim();
  return text.slice(0, 8000); // cap at 8 KB so LLM input stays bounded
}
