/**
 * Tapology event page fetcher.
 *
 * Plain fetch + cheerio — Tapology doesn't JA3-fingerprint. Returns a compact
 * text excerpt of the event page (title, location, full card listing, any
 * write-up blurb) for downstream LLM enrichment. Acts as the structured
 * backbone for non-UFC events the way ufc.com pages do for UFC events.
 */

import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 15_000;
const TEXT_CAP_BYTES = 12_000;

export interface TapologyEventSnapshot {
  url: string;
  finalUrl: string;
  text: string;
  fetchedAt: Date;
}

export async function fetchTapologyEventPreview(
  tapologyUrl: string,
): Promise<TapologyEventSnapshot | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(tapologyUrl, {
      headers: {
        'User-Agent': 'GoodFightsAiEnrichment/1.0 (+https://goodfights.app)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[aiEnrichment.tapology] ${tapologyUrl} returned ${res.status}`);
      return null;
    }
    const html = await res.text();
    const text = extractEventText(html);
    if (!text || text.length < 200) {
      console.warn(`[aiEnrichment.tapology] ${tapologyUrl} produced only ${text?.length ?? 0} chars`);
      return null;
    }
    return { url: tapologyUrl, finalUrl: res.url, text, fetchedAt: new Date() };
  } catch (err: any) {
    console.warn(`[aiEnrichment.tapology] ${tapologyUrl} fetch failed:`, err?.message);
    return null;
  }
}

function extractEventText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, form, iframe').remove();
  $('nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
  $('.adContainer, [class*="ad-" i], [id*="ad-" i], [class*="advertis" i]').remove();
  // Side rails and recommendation widgets — keep the main column.
  $('[class*="sidebar" i], [class*="recommend" i], [class*="related" i]').remove();

  // Tapology uses a generic layout; the event content lives under main containers
  // but doesn't expose a stable class. Prefer the main column when present.
  let root = $('main').first();
  if (root.length === 0) root = $('#content, .content, .pageMain, .pageContent').first();
  if (root.length === 0) root = $('body');

  const text = root.text().replace(/\s+/g, ' ').trim();
  return text.slice(0, TEXT_CAP_BYTES);
}
