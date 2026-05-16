/**
 * Editorial preview fetcher.
 *
 * Generalised replacement for the MMA-Fighting-only fetcher. Brave-searches for
 * recent preview articles about an event across an allowlist of MMA outlets,
 * fetches the top N candidates, returns extracted main-article text.
 *
 * No JA3 protection on these outlets, so plain fetch + cheerio is enough.
 */

import * as cheerio from 'cheerio';
import { braveSearch, BraveFreshness } from '../broadcastDiscovery/searchBrave';

const FETCH_TIMEOUT_MS = 15_000;
const TEXT_CAP_BYTES = 10_000;

/** Outlets we'll accept preview articles from. Order is preference. */
const ALLOWED_DOMAINS = [
  'mmafighting.com',
  'mmajunkie.usatoday.com',
  'bloodyelbow.com',
  'sherdog.com',
  'espn.com',
  'mmamania.com',
  'mmaweekly.com',
  'cbssports.com',
  'bjpenn.com',
];

export interface EditorialSnapshot {
  url: string;
  title: string;
  domain: string;
  text: string;
  fetchedAt: Date;
}

export interface FetchEditorialPreviewsOptions {
  /** Max articles to actually fetch (default 2). Cap is 4 to keep cost predictable. */
  topN?: number;
  /** Brave freshness window. Default 'pm' (past month). */
  freshness?: BraveFreshness;
}

/**
 * @param eventName     e.g. "MVP MMA 1: Rousey vs. Carano" or "UFC 320"
 * @param matchupHint   optional headline matchup like "Rousey vs Carano" — used to bias the query
 */
export async function fetchEditorialPreviews(
  eventName: string,
  matchupHint?: string,
  opts: FetchEditorialPreviewsOptions = {},
): Promise<EditorialSnapshot[]> {
  if (!process.env.BRAVE_API_KEY) {
    console.warn('[aiEnrichment.editorial] BRAVE_API_KEY missing — skipping');
    return [];
  }

  const topN = Math.max(1, Math.min(opts.topN ?? 2, 4));
  const freshness = opts.freshness ?? 'pm';

  // Build a multi-site OR clause so one Brave call covers the whole allowlist.
  const sitesClause = ALLOWED_DOMAINS.map((d) => `site:${d}`).join(' OR ');
  const matchup = matchupHint ?? extractMatchup(eventName);
  const subject = matchup ? `"${matchup}"` : `"${eventName}"`;
  const query = `${subject} preview OR breakdown OR "what to know" (${sitesClause})`;

  let results;
  try {
    results = await braveSearch(query, 10, { freshness });
  } catch (err: any) {
    console.warn('[aiEnrichment.editorial] Brave search failed:', err?.message);
    return [];
  }

  const candidates = results
    .map((r) => ({ ...r, domain: domainOf(r.url) }))
    .filter((r) => ALLOWED_DOMAINS.includes(r.domain))
    .filter((r) => !/\b(results|live[-_ ]?blog|recap|odds-prediction-history|fight-card)\b/i.test(r.url))
    // De-dupe to one article per domain — broader coverage beats redundancy.
    .filter((r, idx, arr) => arr.findIndex((x) => x.domain === r.domain) === idx)
    .slice(0, topN);

  const snapshots: EditorialSnapshot[] = [];
  for (const c of candidates) {
    const snap = await fetchArticle(c.url, c.title, c.domain);
    if (snap) snapshots.push(snap);
  }
  return snapshots;
}

async function fetchArticle(
  url: string,
  title: string,
  domain: string,
): Promise<EditorialSnapshot | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GoodFightsAiEnrichment/1.0 (+https://goodfights.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[aiEnrichment.editorial] ${url} returned ${res.status}`);
      return null;
    }
    const html = await res.text();
    const text = extractArticleText(html);
    if (!text || text.length < 400) {
      console.warn(`[aiEnrichment.editorial] ${url} extracted only ${text.length} chars`);
      return null;
    }
    return { url, title, domain, text, fetchedAt: new Date() };
  } catch (err: any) {
    console.warn(`[aiEnrichment.editorial] ${url} fetch failed:`, err?.message);
    return null;
  }
}

function extractArticleText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, form, iframe').remove();
  $('nav, header, footer, aside').remove();
  $('[class*="newsletter" i], [class*="related" i], [class*="share" i], [class*="comments" i]').remove();
  $('[class*="ad-" i], [id*="ad-" i], [class*="advertis" i]').remove();

  // Try common article containers across the allowlist before falling back.
  const candidates = [
    '.c-entry-content',   // Vox Media (mmafighting, sbnation network)
    'article .article-body',
    'article',
    'main',
    '#content',
    '.entry-content',
  ];
  let root;
  for (const sel of candidates) {
    const node = $(sel).first();
    if (node.length > 0 && node.text().trim().length > 400) {
      root = node;
      break;
    }
  }
  if (!root) root = $('body');

  const text = root.text().replace(/\s+/g, ' ').trim();
  return text.slice(0, TEXT_CAP_BYTES);
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Pull "Rousey vs Carano" out of "MVP MMA 1: Rousey vs. Carano".
 */
function extractMatchup(eventName: string): string | null {
  const m = eventName.match(/([A-Z][\w-]+)\s+vs\.?\s+([A-Z][\w-]+)/i);
  if (!m) return null;
  return `${m[1]} vs ${m[2]}`;
}
