/**
 * Biographical source fetcher for fighter-profile enrichment.
 *
 * Career-arc depth doesn't live in the fight-preview articles the Phase 1
 * pipeline fetches, so the source ladder here is different:
 *
 *   1. UFC athlete page  — when ufcAthleteSlug is set. Authoritative bio + style
 *      copy for UFC fighters. ufc.com JA3-blocks Node TLS, so it reuses the
 *      Puppeteer/stealth handle from fetchUFCEventPreview (same as the event
 *      fetchers). Open a fresh page per fetch — see the shared-page-crash lesson.
 *   2. Wikipedia          — biographical backbone for the career arc. Plain
 *      action-API fetch (no JA3), search-by-name then pull the plaintext extract.
 *   3. Brave editorial    — recent narrative + persona/reputation, across an
 *      allowlist that adds Sherdog/Tapology (deep fighter pages) to the MMA
 *      outlets. Plain fetch + cheerio.
 *
 * Returns a deduped, length-capped list of {url, text, label} sources for the
 * extractor. A fighter with no UFC slug, no Wikipedia page, and no editorial hits
 * comes back with [] — the orchestrator then skips them (no story to tell).
 */

import type { Browser } from 'puppeteer';
import * as cheerio from 'cheerio';
import { braveSearch } from '../../broadcastDiscovery/searchBrave';

const FETCH_TIMEOUT_MS = 15_000;
const TEXT_CAP_BYTES = 9_000;
const UFC_PAGE_TIMEOUT_MS = 30_000;

// Outlets we'll accept fighter-bio / profile articles from. Sherdog + Tapology
// carry structured fighter pages; the rest are narrative coverage.
const ALLOWED_DOMAINS = [
  'sherdog.com',
  'tapology.com',
  'espn.com',
  'mmafighting.com',
  'bloodyelbow.com',
  'mmajunkie.usatoday.com',
  'bjpenn.com',
  'lowkickmma.com',
  'boxingscene.com',
  'talksport.com',
];

export interface BioSource {
  url: string;
  text: string;
  label: string;
}

export interface FetchFighterBioOptions {
  /** Reused stealth browser for ufc.com (avoids JA3 block). Optional. */
  browser?: Browser;
  /** Max editorial articles to fetch beyond UFC + Wikipedia. Default 2, cap 3. */
  editorialTopN?: number;
}

export interface FetchFighterBioResult {
  sources: BioSource[];
  attempted: Array<{ label: string; ok: boolean; chars: number; note?: string }>;
}

export async function fetchFighterBio(
  fighter: {
    firstName: string;
    lastName: string;
    nickname: string | null;
    ufcAthleteSlug: string | null;
    sport: string;
  },
  opts: FetchFighterBioOptions = {},
): Promise<FetchFighterBioResult> {
  const name = `${fighter.firstName} ${fighter.lastName}`.trim();
  const sources: BioSource[] = [];
  const attempted: FetchFighterBioResult['attempted'] = [];

  // 1. UFC athlete page (JA3 block ⇒ needs the stealth browser).
  if (fighter.ufcAthleteSlug && opts.browser) {
    const url = `https://www.ufc.com/athlete/${fighter.ufcAthleteSlug}`;
    const text = await fetchUfcAthletePage(url, opts.browser);
    if (text) {
      sources.push({ url, text, label: 'ufc.com' });
      attempted.push({ label: 'ufc.com', ok: true, chars: text.length });
    } else {
      attempted.push({ label: 'ufc.com', ok: false, chars: 0 });
    }
  }

  // 2. Wikipedia.
  const wiki = await fetchWikipediaBio(name, fighter.sport);
  if (wiki) {
    sources.push(wiki);
    attempted.push({ label: 'wikipedia', ok: true, chars: wiki.text.length });
  } else {
    attempted.push({ label: 'wikipedia', ok: false, chars: 0 });
  }

  // 3. Brave editorial / Sherdog / Tapology.
  const topN = Math.max(1, Math.min(opts.editorialTopN ?? 2, 3));
  const editorial = await fetchBraveFighterEditorial(name, fighter.sport, topN);
  for (const e of editorial) {
    // Skip a domain we already have (Wikipedia handled directly above).
    if (sources.some((s) => s.label === e.label)) continue;
    sources.push(e);
    attempted.push({ label: e.label, ok: true, chars: e.text.length });
  }

  return { sources, attempted };
}

/**
 * UFC.com athlete page via the reused stealth browser. Opens a FRESH page per
 * fetch (the shared-page-crash lesson) and aborts heavy resources.
 */
async function fetchUfcAthletePage(url: string, browser: Browser): Promise<string | null> {
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const t = req.resourceType();
      if (t === 'image' || t === 'font' || t === 'media' || t === 'stylesheet') req.abort();
      else req.continue();
    });

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: UFC_PAGE_TIMEOUT_MS });
    const status = response?.status() ?? 0;
    if (status >= 400) {
      console.warn(`[fighterProfile.bio] ufc athlete ${url} returned HTTP ${status}`);
      return null;
    }

    const text = await page.evaluate((cap: number) => {
      const drop = (sel: string) => document.querySelectorAll(sel).forEach((el) => el.remove());
      drop('script, style, noscript, svg, form, iframe');
      drop('nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]');
      drop('.cookie-banner, .ad, .ads, [class*="advertis" i]');
      const root =
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        document.body;
      return (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, cap);
    }, TEXT_CAP_BYTES);

    if (!text || text.length < 200) {
      console.warn(`[fighterProfile.bio] ufc athlete ${url} produced only ${text?.length ?? 0} chars`);
      return null;
    }
    return text;
  } catch (err: any) {
    console.warn(`[fighterProfile.bio] ufc athlete ${url} failed: ${err?.message}`);
    return null;
  } finally {
    if (page) { try { await page.close(); } catch { /* noop */ } }
  }
}

/**
 * Wikipedia: search by name (biased with the sport so we land the fighter, not a
 * namesake), then pull the plaintext extract via the action API.
 */
async function fetchWikipediaBio(name: string, sport: string): Promise<BioSource | null> {
  const sportHint = sport === 'BOXING' ? 'boxer' : sport === 'MMA' ? 'mixed martial artist' : 'fighter';
  try {
    const searchUrl =
      'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=' +
      encodeURIComponent(`${name} ${sportHint}`);
    const searchRes = await fetchJson(searchUrl);
    const title: string | undefined = searchRes?.query?.search?.[0]?.title;
    if (!title) return null;

    const extractUrl =
      'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&exsectionformat=plain&titles=' +
      encodeURIComponent(title);
    const extractRes = await fetchJson(extractUrl);
    const pages = extractRes?.query?.pages;
    if (!pages) return null;
    const page: any = Object.values(pages)[0];
    const extract: string | undefined = page?.extract;
    if (!extract || extract.length < 300) return null;

    const text = extract.replace(/\s+/g, ' ').trim().slice(0, TEXT_CAP_BYTES);
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    return { url, text, label: 'wikipedia' };
  } catch (err: any) {
    console.warn(`[fighterProfile.bio] wikipedia "${name}" failed: ${err?.message}`);
    return null;
  }
}

async function fetchBraveFighterEditorial(
  name: string,
  sport: string,
  topN: number,
): Promise<BioSource[]> {
  if (!process.env.BRAVE_API_KEY) {
    console.warn('[fighterProfile.bio] BRAVE_API_KEY missing — skipping editorial');
    return [];
  }
  const sportWord = sport === 'BOXING' ? 'boxer' : sport === 'MMA' ? 'MMA' : 'fighter';
  const sitesClause = ALLOWED_DOMAINS.map((d) => `site:${d}`).join(' OR ');
  const query = `"${name}" ${sportWord} (career OR profile OR biography OR record) (${sitesClause})`;

  let results;
  try {
    results = await braveSearch(query, 10, { freshness: 'py' });
  } catch (err: any) {
    console.warn('[fighterProfile.bio] Brave search failed:', err?.message);
    return [];
  }

  const candidates = results
    .map((r) => ({ ...r, domain: domainOf(r.url) }))
    .filter((r) => ALLOWED_DOMAINS.includes(r.domain))
    // De-dupe to one article per domain.
    .filter((r, idx, arr) => arr.findIndex((x) => x.domain === r.domain) === idx)
    .slice(0, topN);

  const out: BioSource[] = [];
  for (const c of candidates) {
    const text = await fetchArticleText(c.url);
    if (text) out.push({ url: c.url, text, label: c.domain });
  }
  return out;
}

async function fetchJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GoodFightsAiEnrichment/1.0 (+https://goodfights.app)' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchArticleText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GoodFightsAiEnrichment/1.0 (+https://goodfights.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      console.warn(`[fighterProfile.bio] ${url} returned ${res.status}`);
      return null;
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, form, iframe').remove();
    $('nav, header, footer, aside').remove();
    $('[class*="newsletter" i], [class*="related" i], [class*="share" i], [class*="comments" i]').remove();
    $('[class*="ad-" i], [id*="ad-" i], [class*="advertis" i]').remove();

    const selectors = ['.c-entry-content', 'article .article-body', 'article', 'main', '#content', '.entry-content'];
    let root;
    for (const sel of selectors) {
      const node = $(sel).first();
      if (node.length > 0 && node.text().trim().length > 400) { root = node; break; }
    }
    if (!root) root = $('body');
    const text = root.text().replace(/\s+/g, ' ').trim();
    if (text.length < 400) return null;
    return text.slice(0, TEXT_CAP_BYTES);
  } catch (err: any) {
    console.warn(`[fighterProfile.bio] ${url} fetch failed:`, err?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
