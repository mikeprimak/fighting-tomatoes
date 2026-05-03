/**
 * Gamebred Event-Collision Repair (one-shot)
 *
 * Background: until the parser fix on 2026-05-03, gamebredDataParser.ts looked
 * up events with `OR: [{ufcUrl}, {promotion+name}]`. Two Gamebred upcoming
 * events on Tapology shared the title "Gamebred Bareknuckle MMA" (Apr 10 ID
 * 140031, May 1 ID 140032) because Tapology hadn't appended a "vs. X"
 * headliner suffix. The OR-name branch matched the first event's row when the
 * second was scraped, merging fights from both cards onto a single row.
 *
 * This script repairs the corrupted state. It:
 *   1. Re-fetches the Gamebred Tapology hub + each Gamebred event page
 *      (cheerio, no puppeteer) to learn the canonical fight list per event.
 *   2. Ensures one Event row exists per Tapology ufcUrl (creates the missing
 *      sibling for the merged pair).
 *   3. Walks every Gamebred Fight in the DB, matches by sorted fighter-pair
 *      against the scraped lists, and re-points fight.eventId to the correct
 *      row. User ratings stay attached to the fight rows themselves and
 *      survive the move.
 *
 * Idempotent: re-running with no remaining mismatches is a no-op.
 *
 * Run: pnpm tsx src/scripts/fixGamebredEventCollision.ts
 *      or: node dist/scripts/fixGamebredEventCollision.js
 *
 * DRY_RUN=1 to preview without writing.
 */

import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import { stripDiacritics } from '../utils/fighterMatcher';
import { getPromotionByCode } from '../config/promotionRegistry';

const prisma = new PrismaClient();

const REGISTRY = getPromotionByCode('GAMEBRED');
const PROMOTION_NAME = REGISTRY?.canonicalPromotion ?? 'Gamebred';
const HUB_URL = REGISTRY?.tapologyHub?.url
  ?? 'https://www.tapology.com/fightcenter/promotions/3931-gamebred-fighting-championship-gbfc';
const SLUG_FILTER = REGISTRY?.tapologyHub?.slugFilter ?? ['gamebred', 'gbfc'];
const TAPOLOGY_BASE = 'https://www.tapology.com';
const DRY_RUN = process.env.DRY_RUN === '1';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11,
};

function parseTapologyDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i, '');
  const m = cleaned.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  return new Date(parseInt(m[3], 10), month, parseInt(m[2], 10));
}

function nameKey(name: string): string {
  return stripDiacritics(name).trim().toLowerCase();
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

interface ScrapedEvent {
  ufcUrl: string;
  eventName: string;
  eventDate: Date | null;
  pairs: string[]; // sorted "name1|name2" keys
}

async function fetchHubEventLinks(): Promise<{ url: string; nameOnHub: string }[]> {
  const res = await fetch(HUB_URL, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`Hub fetch failed: HTTP ${res.status}`);
  const $ = cheerio.load(await res.text());

  const seen = new Set<string>();
  const links: { url: string; nameOnHub: string }[] = [];
  $('a[href*="/fightcenter/events/"]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || !text || text.length < 3) return;
    const lower = href.toLowerCase();
    if (!SLUG_FILTER.some(s => lower.includes(s))) return;
    const fullUrl = href.startsWith('http') ? href : `${TAPOLOGY_BASE}${href}`;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);
    links.push({ url: fullUrl, nameOnHub: text });
  });
  return links;
}

async function fetchEvent(url: string, fallbackName: string): Promise<ScrapedEvent> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`Event fetch failed (${url}): HTTP ${res.status}`);
  const $ = cheerio.load(await res.text());

  // Event name: prefer first non-cookie h1, else <title>
  let eventName = '';
  $('h1').each((_, el) => {
    if (eventName) return;
    const t = $(el).text().trim();
    const lo = t.toLowerCase();
    if (t && !lo.includes('consent') && !lo.includes('cookie') && !lo.includes('privacy')) {
      eventName = t;
    }
  });
  if (!eventName) {
    const title = $('title').text().trim();
    const m = title.match(/^(.+?)(?:\s*[|\-])/);
    eventName = m ? m[1].trim() : fallbackName;
  }

  // Date: prefer description meta which Tapology renders consistently, else page text
  let dateText = '';
  const descContent = $('meta[name="description"]').attr('content') || '';
  const descMatch = descContent.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
  if (descMatch) dateText = descMatch[0];
  if (!dateText) {
    const bodyMatch = $('body').text().match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i);
    if (bodyMatch) dateText = bodyMatch[0];
  }
  const eventDate = parseTapologyDate(dateText);

  // Fight pairs: scoped li.border-b iteration mirrors the live scraper.
  const pairs: string[] = [];
  const seenPairs = new Set<string>();
  $('li.border-b, li[class*="border-b"]').each((_, li) => {
    const $li = $(li);
    if ($li.closest('nav, header, footer, aside').length) return;
    const fighterNames: string[] = [];
    const seenUrls = new Set<string>();
    $li.find('a[href*="/fightcenter/fighters/"]').each((__, a) => {
      const name = $(a).text().trim();
      const href = $(a).attr('href');
      if (!name || name.length < 3 || !href || seenUrls.has(href)) return;
      seenUrls.add(href);
      fighterNames.push(name);
    });
    if (fighterNames.length < 2) return;
    const key = pairKey(nameKey(fighterNames[0]), nameKey(fighterNames[1]));
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    pairs.push(key);
  });

  return { ufcUrl: url, eventName, eventDate, pairs };
}

async function ensureEventRow(scraped: ScrapedEvent): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.event.findFirst({ where: { ufcUrl: scraped.ufcUrl } });
  if (existing) return { id: existing.id, created: false };

  if (DRY_RUN) {
    console.log(`  [dry-run] would CREATE event for ${scraped.ufcUrl} (${scraped.eventName})`);
    return { id: '__dry_run_new__', created: true };
  }

  const now = new Date();
  const date = scraped.eventDate ?? new Date('2099-01-01');
  const status = date < now ? 'COMPLETED' : 'UPCOMING';
  const created = await prisma.event.create({
    data: {
      name: scraped.eventName,
      promotion: PROMOTION_NAME,
      date,
      ufcUrl: scraped.ufcUrl,
      scraperType: REGISTRY?.scraperType ?? 'tapology',
      eventStatus: status,
      location: 'TBA',
    },
  });
  return { id: created.id, created: true };
}

async function main() {
  console.log(`\nGamebred event-collision repair (dry-run=${DRY_RUN})`);
  console.log('='.repeat(70));

  console.log('\n1. Fetching Tapology hub...');
  const hubLinks = await fetchHubEventLinks();
  console.log(`   ${hubLinks.length} Gamebred event links discovered`);

  console.log('\n2. Fetching each event page...');
  const scrapedEvents: ScrapedEvent[] = [];
  for (const link of hubLinks) {
    try {
      await new Promise(r => setTimeout(r, 800));
      const ev = await fetchEvent(link.url, link.nameOnHub);
      scrapedEvents.push(ev);
      const dateStr = ev.eventDate ? ev.eventDate.toISOString().slice(0, 10) : 'no-date';
      console.log(`   ${ev.ufcUrl}  ${dateStr}  ${ev.eventName}  (${ev.pairs.length} pairs)`);
    } catch (err: any) {
      console.warn(`   skipped ${link.url}: ${err.message}`);
    }
  }

  // Build pair -> ufcUrl map. Last writer wins, but pairs should be unique to a single event.
  const pairToUrl = new Map<string, string>();
  const conflictPairs = new Map<string, string[]>();
  for (const ev of scrapedEvents) {
    for (const p of ev.pairs) {
      const prev = pairToUrl.get(p);
      if (prev && prev !== ev.ufcUrl) {
        const list = conflictPairs.get(p) ?? [prev];
        list.push(ev.ufcUrl);
        conflictPairs.set(p, list);
      } else {
        pairToUrl.set(p, ev.ufcUrl);
      }
    }
  }
  if (conflictPairs.size > 0) {
    console.warn(`\n   ⚠ ${conflictPairs.size} fighter pair(s) appear on multiple Gamebred events on Tapology:`);
    for (const [p, urls] of conflictPairs) console.warn(`     ${p} -> ${urls.join(', ')}`);
    console.warn('     These pairs will be left alone (ambiguous source-of-truth).');
  }

  console.log('\n3. Ensuring one Event row per ufcUrl...');
  const urlToEventId = new Map<string, string>();
  for (const ev of scrapedEvents) {
    const { id, created } = await ensureEventRow(ev);
    urlToEventId.set(ev.ufcUrl, id);
    if (created) console.log(`   + created row for ${ev.ufcUrl}`);
  }

  console.log('\n4. Re-attributing Gamebred fights to correct event rows...');
  const fights = await prisma.fight.findMany({
    where: { event: { promotion: PROMOTION_NAME } },
    include: {
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
      event: { select: { id: true, name: true, ufcUrl: true } },
    },
  });
  console.log(`   ${fights.length} Gamebred fights in DB`);

  let moved = 0;
  let alreadyCorrect = 0;
  let unmatched = 0;
  let skippedConflict = 0;

  for (const f of fights) {
    const n1 = nameKey(`${f.fighter1.firstName} ${f.fighter1.lastName}`.trim());
    const n2 = nameKey(`${f.fighter2.firstName} ${f.fighter2.lastName}`.trim());
    const key = pairKey(n1, n2);

    if (conflictPairs.has(key)) {
      skippedConflict++;
      continue;
    }

    const correctUrl = pairToUrl.get(key);
    if (!correctUrl) {
      unmatched++;
      console.log(`   ? no scraped match for "${n1}" vs "${n2}" (currently on ${f.event.name} / ${f.event.ufcUrl ?? 'no-url'})`);
      continue;
    }

    const correctEventId = urlToEventId.get(correctUrl);
    if (!correctEventId) {
      unmatched++;
      continue;
    }

    if (f.eventId === correctEventId) {
      alreadyCorrect++;
      continue;
    }

    console.log(`   → moving "${n1}" vs "${n2}": ${f.event.ufcUrl ?? f.event.name} → ${correctUrl}`);

    if (DRY_RUN) {
      moved++;
      continue;
    }

    // Defensive: in case a duplicate already exists on the destination row
    // (shouldn't normally with the bug we're fixing, but cover for stranger states).
    const existingOnTarget = await prisma.fight.findFirst({
      where: {
        eventId: correctEventId,
        OR: [
          { fighter1Id: f.fighter1Id, fighter2Id: f.fighter2Id },
          { fighter1Id: f.fighter2Id, fighter2Id: f.fighter1Id },
        ],
      },
      select: { id: true, totalRatings: true },
    });

    if (existingOnTarget && existingOnTarget.id !== f.id) {
      const keepThis = (f.totalRatings || 0) > (existingOnTarget.totalRatings || 0);
      if (keepThis) {
        console.log(`     ↳ duplicate exists on target (id=${existingOnTarget.id}); deleting target dup, moving this fight`);
        await prisma.fight.delete({ where: { id: existingOnTarget.id } });
        await prisma.fight.update({ where: { id: f.id }, data: { eventId: correctEventId } });
      } else {
        console.log(`     ↳ duplicate exists on target with more ratings; deleting this orphan instead`);
        await prisma.fight.delete({ where: { id: f.id } });
      }
    } else {
      await prisma.fight.update({ where: { id: f.id }, data: { eventId: correctEventId } });
    }

    moved++;
  }

  console.log('\nSummary');
  console.log('-'.repeat(70));
  console.log(`  moved:            ${moved}`);
  console.log(`  already correct:  ${alreadyCorrect}`);
  console.log(`  unmatched:        ${unmatched}  (likely cancelled fights or stale rows)`);
  console.log(`  skipped (ambig.): ${skippedConflict}`);
  console.log(`  events touched:   ${urlToEventId.size}`);
  if (DRY_RUN) console.log('\n  DRY RUN — no writes performed. Re-run without DRY_RUN=1 to apply.');
}

main()
  .catch(err => {
    console.error('\nRepair failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
