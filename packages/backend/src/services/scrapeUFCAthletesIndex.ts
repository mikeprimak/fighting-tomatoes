/**
 * UFC.com Athletes Index Scraper
 *
 * Paginates `https://www.ufc.com/athletes/all?page=N` to harvest every
 * (display name, slug) pair that UFC.com publishes. ~3,100 athletes across
 * ~310 pages of 10 entries each (as of 2026-05).
 *
 * Why this exists: backfilling fighter headshots by guessing the slug from
 * the DB display name misses every case where UFC.com uses a different
 * canonical form — suffixes ("Khalil Rountree" → khalil-rountree-jr),
 * typos in our DB ("Josh Emmet" → josh-emmett), nicknames-as-name
 * ("Paulo Borrachinha" → paulo-costa), and Saint/St. variants. With the
 * canonical index in hand we stop guessing.
 *
 * Output cached to `scraped-data/ufc-athletes-index.json` so re-runs in
 * the same workflow skip the rescrape. Cache is per-run only (workflows
 * start with a clean checkout) so we always have a fresh index in CI.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Page } from 'puppeteer';
import type { AthleteBrowserHandle } from './scrapeUFCAthleteHeadshot';

const PAGE_TIMEOUT_MS = 25_000;
const INDEX_CACHE_PATH = path.resolve(
  __dirname, '../../scraped-data/ufc-athletes-index.json',
);

export interface UFCAthleteIndexEntry {
  name: string;
  slug: string;
}

interface PageResult {
  entries: UFCAthleteIndexEntry[];
  /** True when this page returned zero athletes — used as the pagination
   *  terminator (no totalCount header exposed in HTML). */
  empty: boolean;
}

async function scrapePage(handle: AthleteBrowserHandle, pageNum: number): Promise<PageResult> {
  const url = `https://www.ufc.com/athletes/all?page=${pageNum}`;
  const page: Page = await handle.browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setRequestInterception(true);
    page.on('request', req => {
      const t = req.resourceType();
      if (t === 'image' || t === 'stylesheet' || t === 'font' || t === 'media') req.abort();
      else req.continue();
    });

    let resp;
    try {
      resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    } catch (err: any) {
      throw new Error(`page=${pageNum} nav failed: ${err.message}`);
    }
    if (!resp || resp.status() >= 400) {
      throw new Error(`page=${pageNum} HTTP ${resp?.status() ?? 'no-response'}`);
    }

    const entries: UFCAthleteIndexEntry[] = await page.evaluate(() => {
      // Each athlete card has a link like /athlete/<slug> wrapping the name.
      // Some pages have multiple link variants per card (image, name, view-profile)
      // — we de-dupe by slug after collection.
      const out: { name: string; slug: string }[] = [];
      const seen = new Set<string>();
      const anchors = Array.from(document.querySelectorAll('a[href^="/athlete/"]')) as HTMLAnchorElement[];
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/^\/athlete\/([a-z0-9-]+)$/i);
        if (!m) continue;
        const slug = m[1].toLowerCase();
        if (seen.has(slug)) continue;
        const text = (a.textContent || '').trim();
        // Some anchors are image links with empty text. Walk to the card root
        // and find a sibling with the athlete name.
        let name = text;
        if (!name) {
          const card = a.closest('.c-listing-athlete') || a.closest('article') || a.parentElement;
          const nameEl = card?.querySelector('.c-listing-athlete__name, .field--name-name, h3, h2');
          name = (nameEl?.textContent || '').trim();
        }
        if (!name) continue;
        seen.add(slug);
        out.push({ name, slug });
      }
      return out;
    });

    return { entries, empty: entries.length === 0 };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Paginate UFC.com /athletes/all from page 0 until pages start returning
 * zero athletes. Returns a fully-deduped (by slug) list.
 *
 * Concurrency is INTENTIONALLY low (default 2). UFC's CDN has rate-limited
 * us before when running aggressive sweeps; the index scrape only happens
 * once per workflow so a slower steady pace beats triggering 403s.
 */
export async function scrapeAllUFCAthletes(
  handle: AthleteBrowserHandle,
  options: { concurrency?: number; maxPages?: number } = {},
): Promise<UFCAthleteIndexEntry[]> {
  const concurrency = options.concurrency ?? 2;
  const maxPages = options.maxPages ?? 500;

  const collected = new Map<string, UFCAthleteIndexEntry>();
  let nextPage = 0;
  let consecutiveEmpty = 0;
  // Two consecutive empty pages = definitive end (one empty could be a
  // transient hiccup or a missing page in a sparse listing).
  const STOP_AFTER_EMPTY = 2;
  let stopped = false;
  let totalErrors = 0;

  console.log(`[ufc-index] Scraping /athletes/all (concurrency=${concurrency})…`);
  const startedAt = Date.now();

  async function worker(workerId: number): Promise<void> {
    for (;;) {
      if (stopped || nextPage >= maxPages) return;
      const p = nextPage++;
      try {
        const r = await scrapePage(handle, p);
        for (const e of r.entries) {
          if (!collected.has(e.slug)) collected.set(e.slug, e);
        }
        if (r.empty) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= STOP_AFTER_EMPTY) {
            stopped = true;
            return;
          }
        } else {
          consecutiveEmpty = 0;
        }
        if (p % 25 === 0) {
          console.log(`[ufc-index] worker${workerId} page=${p} total=${collected.size}`);
        }
      } catch (err: any) {
        totalErrors++;
        console.warn(`[ufc-index] worker${workerId} page=${p} ${err.message}`);
        // Don't stop on individual page errors — could be a transient 403.
        // The maxPages cap and totalErrors check guard against runaway.
        if (totalErrors > 30) {
          console.error('[ufc-index] Too many errors, halting.');
          stopped = true;
          return;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(
    `[ufc-index] Done. ${collected.size} athletes across ~${nextPage} pages in ${elapsedSec}s. Errors: ${totalErrors}.`,
  );
  return Array.from(collected.values());
}

export function writeIndexCache(entries: UFCAthleteIndexEntry[]): void {
  try {
    fs.mkdirSync(path.dirname(INDEX_CACHE_PATH), { recursive: true });
    fs.writeFileSync(INDEX_CACHE_PATH, JSON.stringify({ count: entries.length, entries }, null, 2));
    console.log(`[ufc-index] Cached ${entries.length} entries to ${INDEX_CACHE_PATH}`);
  } catch (err: any) {
    console.warn(`[ufc-index] Cache write failed: ${err.message}`);
  }
}

export function readIndexCache(): UFCAthleteIndexEntry[] | null {
  try {
    if (!fs.existsSync(INDEX_CACHE_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(INDEX_CACHE_PATH, 'utf8'));
    if (!raw?.entries || !Array.isArray(raw.entries)) return null;
    return raw.entries;
  } catch {
    return null;
  }
}
