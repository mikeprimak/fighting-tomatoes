/**
 * BKFC stale-matchup auditor (READ-ONLY).
 *
 * Background: docs/HANDOFF-bkfc-stale-matchups-2026-05-29.md
 *
 * After the BKFC winner-extraction fix (PR #5), a residual remains: a handful of
 * fight rows on BKFC's COMPLETED events that have no winner/method. These are NOT
 * a scraping gap — the real bouts are on bkfc.com and are correctly scored. They
 * are STALE matchup rows: early provisional bookings whose opponents later changed.
 * The old pairing was never reconciled (lifecycle auto-completed the event, or the
 * cancellation pass never ran), so a phantom row survives pointing at a matchup
 * that never happened, alongside the real (correctly scored) bout.
 *
 * This script re-scrapes every COMPLETED BKFC event, diffs each DB fight row's
 * pairing against the authoritative current pairings, and prints every DB row whose
 * pairing is ABSENT from the scrape — with its ratings / reviews / predictions /
 * hype (crew prediction) / comment counts. That output decides cancel-vs-merge per
 * row (no engagement -> safe to CANCEL; has engagement -> merge into the real bout
 * that shares a fighter, per [[project_tapology_bleed_residual_cleanup]]).
 *
 * It modifies NOTHING. It is the safe first step before any cleanup writes.
 *
 * Matching mirrors bkfcLiveParser.findFightByFighters (bidirectional last-name
 * match + partial fallback) so "absent from scrape" means the same thing the
 * parser would conclude.
 *
 * Run from packages/backend (uses DATABASE_URL = Render external):
 *   node_modules/.bin/ts-node src/scripts/auditBKFCStaleMatchups.ts
 *
 * Each event takes ~15-20s (Puppeteer). Eight events ~ a couple minutes.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PrismaClient } from '@prisma/client';
import { stripDiacritics } from '../utils/fighterMatcher';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

const SCRAPER_TIMEOUT_MS = 120_000;
const SCRAPER_MAX_BUFFER = 10 * 1024 * 1024;

const normalize = (name: string) => stripDiacritics(name || '').toLowerCase().trim();
const lastName = (full: string) => {
  const parts = (full || '').trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
};

interface ScrapedPair {
  f1: string; // full name from slug
  f2: string;
  scored: boolean;
}

/**
 * Mirror of bkfcLiveParser.findFightByFighters: does this DB last-name pair match
 * any scraped pairing (bidirectional + partial fallback)?
 */
function pairInScrape(db1Last: string, db2Last: string, pairs: ScrapedPair[]): ScrapedPair | null {
  const d1 = normalize(db1Last);
  const d2 = normalize(db2Last);
  for (const p of pairs) {
    const s1Last = normalize(lastName(p.f1));
    const s2Last = normalize(lastName(p.f2));
    const s1Full = normalize(p.f1);
    const s2Full = normalize(p.f2);

    if ((d1 === s1Last && d2 === s2Last) || (d1 === s2Last && d2 === s1Last)) return p;
    if ((d1 === s1Full && d2 === s2Full) || (d1 === s2Full && d2 === s1Full)) return p;
    if ((d1.includes(s1Last) || s1Last.includes(d1)) && (d2.includes(s2Last) || s2Last.includes(d2))) return p;
    if ((d1.includes(s2Last) || s2Last.includes(d1)) && (d2.includes(s1Last) || s1Last.includes(d2))) return p;
  }
  return null;
}

async function scrapeEvent(eventUrl: string): Promise<ScrapedPair[]> {
  const scraperPath = path.join(__dirname, '../services/scrapeBKFCLiveEvent.js');
  const outputDir = path.join(__dirname, '../../live-event-data/bkfc');
  await fs.mkdir(outputDir, { recursive: true });

  await execAsync(`node "${scraperPath}" "${eventUrl}" "${outputDir}"`, {
    timeout: SCRAPER_TIMEOUT_MS,
    maxBuffer: SCRAPER_MAX_BUFFER,
  });

  const files = await fs.readdir(outputDir);
  const jsonFiles = files
    .filter(f => f.startsWith('bkfc-live-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (jsonFiles.length === 0) throw new Error('Scraper produced no output JSON');

  const raw = JSON.parse(await fs.readFile(path.join(outputDir, jsonFiles[0]), 'utf-8'));
  const fights = raw.events?.[0]?.fights ?? [];

  // Cleanup: keep only last 5 scrape outputs.
  for (const f of jsonFiles.slice(5)) {
    try { await fs.unlink(path.join(outputDir, f)); } catch { /* ignore */ }
  }

  return fights.map((f: any) => ({
    f1: f.fighter1Name,
    f2: f.fighter2Name,
    scored: !!(f.result && f.result.winner),
  }));
}

async function main() {
  const events = await prisma.event.findMany({
    where: { scraperType: 'bkfc', eventStatus: 'COMPLETED' },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      name: true,
      date: true,
      ufcUrl: true,
      fights: {
        select: {
          id: true,
          winner: true,
          method: true,
          fightStatus: true,
          orderOnCard: true,
          cardType: true,
          fighter1: { select: { lastName: true, firstName: true } },
          fighter2: { select: { lastName: true, firstName: true } },
          _count: {
            select: {
              ratings: true,
              reviews: true,
              predictions: true,
              preFightComments: true,
              crewPredictions: true,
              crewMessages: true,
            },
          },
        },
      },
    },
  });

  console.log(`\n=== BKFC stale-matchup audit (READ-ONLY) ===`);
  console.log(`COMPLETED BKFC events: ${events.length}\n`);

  let totalStale = 0;
  let staleWithEngagement = 0;
  const cancelCandidates: string[] = [];
  const mergeCandidates: string[] = [];

  for (const ev of events) {
    const dateStr = ev.date ? ev.date.toISOString().slice(0, 10) : '?';
    console.log(`\n──────────────────────────────────────────────`);
    console.log(`EVENT: ${ev.name} (${dateStr})  [${ev.fights.length} DB rows]`);
    if (!ev.ufcUrl) {
      console.log(`  ⚠ No event URL on this event — cannot scrape, SKIPPING.`);
      continue;
    }
    console.log(`  URL: ${ev.ufcUrl}`);

    let scraped: ScrapedPair[];
    try {
      scraped = await scrapeEvent(ev.ufcUrl);
    } catch (e: any) {
      console.log(`  ⚠ Scrape failed: ${e.message} — SKIPPING (no conclusions for this event).`);
      continue;
    }

    if (scraped.length === 0) {
      console.log(`  ⚠ Scrape returned 0 pairings — treating as garbage, SKIPPING (fail-closed).`);
      continue;
    }

    console.log(`  Scrape returned ${scraped.length} pairings (${scraped.filter(s => s.scored).length} scored):`);
    scraped.forEach(p => console.log(`    - ${p.f1} vs ${p.f2}${p.scored ? ' [scored]' : ''}`));

    // Diff every non-CANCELLED DB row against the scrape, recording which scraped
    // pairing it mapped to. Two classes of phantom:
    //   (1) ABSENT  — pairing not in the scrape at all (opponent changed).
    //   (2) DUP     — pairing IS in the scrape, but >1 non-cancelled DB row maps
    //                 to the SAME scraped pairing (e.g. duplicate "Justi"/"Justin
    //                 Walters" fighter records). Last-name matching alone would
    //                 call this "clean"; the unscored sibling is still a phantom.
    const active = ev.fights.filter(f => f.fightStatus !== 'CANCELLED');
    const mappedTo = new Map<typeof active[number], ScrapedPair | null>();
    const byScrapePair = new Map<ScrapedPair, typeof active>();
    for (const f of active) {
      const m = pairInScrape(f.fighter1.lastName, f.fighter2.lastName, scraped);
      mappedTo.set(f, m);
      if (m) {
        if (!byScrapePair.has(m)) byScrapePair.set(m, []);
        byScrapePair.get(m)!.push(f);
      }
    }

    const staleRows = active.filter(f => {
      const m = mappedTo.get(f);
      if (!m) return true; // class (1): absent from scrape
      // class (2): multiple rows share this scraped pairing — the one(s) without a
      // result are phantoms; the real (scored / has-winner) row is the keeper.
      const siblings = byScrapePair.get(m)!;
      if (siblings.length > 1 && !f.winner) return true;
      return false;
    });

    if (staleRows.length === 0) {
      console.log(`  ✓ Clean — every non-cancelled DB row matches a scraped pairing.`);
      continue;
    }

    console.log(`\n  ⚠ ${staleRows.length} STALE row(s) (pairing absent from current scrape):`);
    for (const f of staleRows) {
      const c = f._count;
      const engagement =
        c.ratings + c.reviews + c.predictions + c.preFightComments + c.crewPredictions + c.crewMessages;
      const pairing = `${f.fighter1.firstName ?? ''} ${f.fighter1.lastName} vs ${f.fighter2.firstName ?? ''} ${f.fighter2.lastName}`.replace(/\s+/g, ' ').trim();
      const counts = `ratings=${c.ratings} reviews=${c.reviews} preds=${c.predictions} comments=${c.preFightComments} crewPreds=${c.crewPredictions} crewMsgs=${c.crewMessages}`;
      const verdict = engagement === 0 ? 'CANCEL (no engagement)' : '⚑ MERGE (has engagement)';
      console.log(`    #${f.orderOnCard} [${f.fightStatus}] [${f.cardType ?? '?'}] ${pairing}`);
      console.log(`        winner=${f.winner ?? 'null'} method=${f.method ?? 'null'} | ${counts} -> ${verdict}`);

      totalStale++;
      const tag = `[${ev.name}] #${f.orderOnCard} ${pairing} (fightId=${f.id})`;
      if (engagement === 0) {
        cancelCandidates.push(tag);
      } else {
        staleWithEngagement++;
        mergeCandidates.push(`${tag} — ${counts}`);
      }
    }
  }

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Total stale rows found: ${totalStale}`);
  console.log(`  -> safe to CANCEL (no engagement): ${cancelCandidates.length}`);
  console.log(`  -> need MERGE (has engagement):    ${staleWithEngagement}`);

  if (cancelCandidates.length) {
    console.log(`\nCANCEL candidates:`);
    cancelCandidates.forEach(t => console.log(`  - ${t}`));
  }
  if (mergeCandidates.length) {
    console.log(`\nMERGE candidates (DO NOT auto-cancel — ratings would be lost):`);
    mergeCandidates.forEach(t => console.log(`  - ${t}`));
  }

  console.log(`\n(Read-only audit. No rows were modified.)`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
