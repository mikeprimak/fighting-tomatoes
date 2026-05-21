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
 * Implementation: DuckDuckGo HTML search via Puppeteer (stealth-enabled
 * browser). We initially tried plain HTTPS fetch since html.duckduckgo.com
 * is server-rendered, but DDG silently blocks AWS / GH Actions IP ranges
 * for non-browser fingerprints — every request returns 200 with results
 * that don't include any ufc.com links. Puppeteer with stealth gets through.
 *
 * We query `<name> ufc.com athlete` and take the first result whose URL is
 * on any *.ufc.com host with an `/athlete/<slug>` path. Localized subdomains
 * (kr.ufc.com, etc.) share the same slug as www, so we accept them.
 *
 * Returns the slug or null if no usable result was found.
 */
export async function searchUFCAthleteSlugViaDDG(
  fighterName: string,
  handle: AthleteBrowserHandle,
): Promise<string | null> {
  const query = encodeURIComponent(`${fighterName} ufc.com athlete`);
  const url = `https://html.duckduckgo.com/html/?q=${query}`;
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
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    } catch {
      return null;
    }
    if (!response || response.status() >= 400) return null;

    // DDG HTML wraps result hrefs in a redirector: //duckduckgo.com/l/?uddg=<urlencoded>...
    // Sometimes it serves the raw URL. Handle both.
    const hrefs: string[] = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a.result__a, a.result__url')) as HTMLAnchorElement[];
      return anchors.map(a => a.href || a.getAttribute('href') || '').filter(Boolean);
    });

    for (const raw of hrefs) {
      let resolved = raw;
      const ddgMatch = raw.match(/[?&]uddg=([^&]+)/);
      if (ddgMatch) {
        try { resolved = decodeURIComponent(ddgMatch[1]); } catch { continue; }
      }
      const ufcMatch = resolved.match(/https?:\/\/(?:[a-z]{2,3}\.)?ufc\.com\/athlete\/([a-z0-9-]+)/i);
      if (ufcMatch && ufcMatch[1]) return ufcMatch[1].toLowerCase();
    }
    return null;
  } finally {
    await page.close().catch(() => {});
  }
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

// =================== Name-match helpers for UFC.com athlete index ===================
//
// The backfill resolves a DB fighter to a UFC.com slug via the harvested
// /athletes/all index. Goal: match every reasonable spelling/suffix variant
// without false positives on common surnames.

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`.]/g, '')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensOf(name: string): string[] {
  return normalizeForMatch(name).split(' ').filter(Boolean);
}

function stripSuffixTokens(tokens: string[]): string[] {
  // Drop trailing "jr", "sr", "ii", "iii", "iv" — UFC slugs include them but
  // our DB display names often don't (and vice versa).
  const stripped = [...tokens];
  while (stripped.length > 1) {
    const tail = stripped[stripped.length - 1];
    if (/^(jr|sr|ii|iii|iv|v)$/i.test(tail)) stripped.pop();
    else break;
  }
  return stripped;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export interface AthleteIndexLookup {
  byExact: Map<string, string>;            // normalized full name → slug
  byLastFirstInitial: Map<string, string[]>;  // "lastname f" → [slugs]
  byLastName: Map<string, string[]>;       // "lastname" → [slugs]
  all: Array<{ normalized: string; slug: string }>;
}

export function buildAthleteIndex(
  entries: Array<{ name: string; slug: string }>,
): AthleteIndexLookup {
  const byExact = new Map<string, string>();
  const byLastFirstInitial = new Map<string, string[]>();
  const byLastName = new Map<string, string[]>();
  const all: Array<{ normalized: string; slug: string }> = [];

  for (const e of entries) {
    const norm = normalizeForMatch(e.name);
    if (!norm) continue;
    if (!byExact.has(norm)) byExact.set(norm, e.slug);

    const tokens = stripSuffixTokens(tokensOf(e.name));
    if (tokens.length >= 1) {
      const last = tokens[tokens.length - 1];
      const lastArr = byLastName.get(last) || [];
      if (!lastArr.includes(e.slug)) lastArr.push(e.slug);
      byLastName.set(last, lastArr);

      if (tokens.length >= 2) {
        const firstInitial = tokens[0][0];
        const key = `${last} ${firstInitial}`;
        const arr = byLastFirstInitial.get(key) || [];
        if (!arr.includes(e.slug)) arr.push(e.slug);
        byLastFirstInitial.set(key, arr);
      }
    }
    all.push({ normalized: norm, slug: e.slug });
  }
  return { byExact, byLastFirstInitial, byLastName, all };
}

/**
 * Resolve a DB fighter name against the UFC.com athletes index. Multi-tier:
 *
 *   1. Exact normalized match (handles "Conor McGregor", diacritics, etc.)
 *   2. Strip-suffix exact match (DB "Khalil Rountree" → index "Khalil Rountree Jr")
 *      We compare the DB name's tokens against suffix-stripped index entries.
 *   3. Last name + first initial (handles rare disambiguation cases where the
 *      DB has only one token off, e.g. middle-name variants)
 *   4. Levenshtein ≤ 3 on the normalized full name, restricted to candidates
 *      sharing the same last name (catches "Josh Emmet" → "Josh Emmett",
 *      "Santiagio Ponzinibbio" → "Santiago Ponzinibbio")
 *
 * Returns the matched slug or null when no confident match exists.
 * Nickname-as-name cases (e.g., DB "Paulo Borrachinha" vs UFC "Paulo Costa")
 * intentionally do NOT match here — they fall through to DDG fallback.
 */
export function lookupAthleteSlug(
  dbName: string,
  index: AthleteIndexLookup,
): string | null {
  const norm = normalizeForMatch(dbName);
  if (!norm) return null;

  // 1. Exact
  const exact = index.byExact.get(norm);
  if (exact) return exact;

  const dbTokens = stripSuffixTokens(tokensOf(dbName));
  if (dbTokens.length === 0) return null;
  const dbLast = dbTokens[dbTokens.length - 1];
  const dbFirstInitial = dbTokens[0][0];

  // 2. Suffix-stripped exact: rebuild the DB name without suffix tokens and
  //    try matching that against any index entry whose suffix-stripped form
  //    equals it.
  const dbStripped = dbTokens.join(' ');
  const lastNameCandidates = index.byLastName.get(dbLast) || [];
  for (const slug of lastNameCandidates) {
    // Reconstruct the index entry's stripped form from the slug's source
    // entry. We stored only slugs in byLastName, so look up the full
    // normalized form via index.all.
    const entry = index.all.find(a => a.slug === slug);
    if (!entry) continue;
    const idxStripped = stripSuffixTokens(tokensOf(entry.normalized)).join(' ');
    if (idxStripped === dbStripped) return slug;
  }

  // 3. Last name + first initial
  const liKey = `${dbLast} ${dbFirstInitial}`;
  const liCands = index.byLastFirstInitial.get(liKey) || [];
  if (liCands.length === 1) return liCands[0];

  // 4. Fuzzy (Levenshtein ≤ 3) among entries sharing the last name. This
  //    catches typos in either the DB ("Josh Emmet" / "Santiagio") or
  //    historical OCR'd imports.
  let bestSlug: string | null = null;
  let bestDist = 4;
  for (const slug of lastNameCandidates) {
    const entry = index.all.find(a => a.slug === slug);
    if (!entry) continue;
    const d = levenshtein(norm, entry.normalized);
    if (d < bestDist) { bestDist = d; bestSlug = slug; }
  }
  if (bestDist <= 3) return bestSlug;
  return null;
}
