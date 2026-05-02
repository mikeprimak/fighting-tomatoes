/**
 * Retroactive Results Backfill Orchestrator (Phase 2)
 *
 * Daily cron entry point. Finds recently-completed events whose fights are
 * still missing winners and dispatches to the per-org wrapper that knows how
 * to scrape and parse that org. Each wrapper reuses the existing live
 * scraper + live parser as the single source of truth.
 *
 * Coverage:
 *   - scraperType = 'ufc'       → backfillUFCResults
 *   - scraperType = 'bkfc'      → backfillBKFCResults
 *   - scraperType = 'onefc'     → backfillOneFCResults
 *   - scraperType = 'oktagon'   → backfillOktagonResults
 *   - scraperType = 'matchroom' → backfillMatchroomResults  (Matchroom-native;
 *                                 Matchroom-via-Tapology is on the older
 *                                 tapology-backfill.yml path)
 *   - scraperType = 'pfl'       → backfillPFLResults  (pflmma.com-native)
 *   - scraperType = 'tapology'  → handled by tapology-backfill.yml; logged
 *                                 here for visibility, not invoked.
 *   - others                    → logged as not-yet-covered (e.g. 'raf').
 *
 * Candidates:
 *   - eventStatus = COMPLETED
 *   - date within BACKFILL_WINDOW_DAYS (default 14)
 *   - has >=1 fight with winner IS NULL and fightStatus in (COMPLETED, UPCOMING, LIVE)
 *
 * Environment:
 *   DATABASE_URL          - Required
 *   BACKFILL_WINDOW_DAYS  - Optional, defaults to 14
 *   BACKFILL_ORGS         - Optional CSV filter, e.g. "ufc" to limit to one org
 */

import { PrismaClient } from '@prisma/client';
import { backfillUFCResults } from '../services/backfillUFCResults';
import { backfillBKFCResults } from '../services/backfillBKFCResults';
import { backfillOneFCResults } from '../services/backfillOneFCResults';
import { backfillOktagonResults } from '../services/backfillOktagonResults';
import { backfillMatchroomResults } from '../services/backfillMatchroomResults';
import { backfillPFLResults } from '../services/backfillPFLResults';

const prisma = new PrismaClient();

const DEFAULT_WINDOW_DAYS = 14;

interface OrgStats {
  candidates: number;
  succeeded: number;
  failed: number;
  filledWinners: number;
}

function emptyStats(): OrgStats {
  return { candidates: 0, succeeded: 0, failed: 0, filledWinners: 0 };
}

async function findCandidates(windowDays: number, orgFilter: string[] | null) {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return prisma.event.findMany({
    where: {
      eventStatus: 'COMPLETED',
      date: { gte: windowStart },
      ...(orgFilter ? { scraperType: { in: orgFilter } } : { scraperType: { not: null } }),
      fights: {
        some: {
          winner: null,
          fightStatus: { in: ['COMPLETED', 'UPCOMING', 'LIVE'] },
        },
      },
    },
    orderBy: { date: 'desc' },
  });
}

async function main() {
  const windowDays = parseInt(process.env.BACKFILL_WINDOW_DAYS || `${DEFAULT_WINDOW_DAYS}`, 10);
  const orgFilter = process.env.BACKFILL_ORGS
    ? process.env.BACKFILL_ORGS.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  console.log('\n========================================');
  console.log('[backfill] Retroactive results backfill (orchestrator)');
  console.log(`[backfill] Window: last ${windowDays} days`);
  if (orgFilter) console.log(`[backfill] Org filter: ${orgFilter.join(', ')}`);
  console.log(`[backfill] Started: ${new Date().toISOString()}`);
  console.log('========================================');

  const candidates = await findCandidates(windowDays, orgFilter);
  console.log(`\n[backfill] Found ${candidates.length} candidate event(s)`);

  const stats: Record<string, OrgStats> = {};
  const tally = (org: string) => (stats[org] ||= emptyStats());

  for (const event of candidates) {
    const org = event.scraperType || 'unknown';
    tally(org).candidates++;

    console.log(`\n[backfill] ${event.name} (${event.id}) — scraperType=${org}`);

    try {
      switch (org) {
        case 'ufc': {
          const r = await backfillUFCResults(prisma, {
            id: event.id,
            name: event.name,
            ufcUrl: event.ufcUrl,
          });
          tally(org).succeeded++;
          tally(org).filledWinners += r.filledWinners;
          console.log(`  [backfill] ufc: filled ${r.filledWinners} winner(s)`);
          break;
        }

        case 'tapology':
          // Already covered by the dedicated tapology-backfill.yml workflow +
          // backfillTapologyResults.ts. Logged here for visibility but not
          // re-invoked (would do duplicate scraping work).
          console.log('  [backfill] tapology: covered by tapology-backfill.yml, skipping');
          tally(org).succeeded++;
          break;

        case 'bkfc': {
          const r = await backfillBKFCResults(prisma, {
            id: event.id,
            name: event.name,
            ufcUrl: event.ufcUrl,
          });
          tally(org).succeeded++;
          tally(org).filledWinners += r.filledWinners;
          console.log(`  [backfill] bkfc: filled ${r.filledWinners} winner(s)`);
          break;
        }

        case 'onefc': {
          const r = await backfillOneFCResults(prisma, {
            id: event.id,
            name: event.name,
            ufcUrl: event.ufcUrl,
          });
          tally(org).succeeded++;
          tally(org).filledWinners += r.filledWinners;
          console.log(`  [backfill] onefc: filled ${r.filledWinners} winner(s)`);
          break;
        }

        case 'oktagon': {
          const r = await backfillOktagonResults(prisma, {
            id: event.id,
            name: event.name,
            ufcUrl: event.ufcUrl,
          });
          tally(org).succeeded++;
          tally(org).filledWinners += r.filledWinners;
          console.log(`  [backfill] oktagon: filled ${r.filledWinners} winner(s)`);
          break;
        }

        case 'matchroom': {
          const r = await backfillMatchroomResults(prisma, {
            id: event.id,
            name: event.name,
            ufcUrl: event.ufcUrl,
          });
          tally(org).succeeded++;
          tally(org).filledWinners += r.filledWinners;
          console.log(`  [backfill] matchroom: filled ${r.filledWinners} winner(s)`);
          break;
        }

        case 'pfl': {
          const r = await backfillPFLResults(prisma, {
            id: event.id,
            name: event.name,
            ufcUrl: event.ufcUrl,
          });
          tally(org).succeeded++;
          tally(org).filledWinners += r.filledWinners;
          console.log(`  [backfill] pfl: filled ${r.filledWinners} winner(s)`);
          break;
        }

        default:
          console.log(`  [backfill] ${org}: no backfill path defined, skipping`);
      }
    } catch (err: any) {
      tally(org).failed++;
      console.error(`  [backfill] ERROR on ${event.name}: ${err.message}`);
    }
  }

  console.log('\n========================================');
  console.log('[backfill] Summary by org');
  for (const [org, s] of Object.entries(stats)) {
    console.log(`  ${org}: candidates=${s.candidates} succeeded=${s.succeeded} failed=${s.failed} filledWinners=${s.filledWinners}`);
  }
  const totalFailed = Object.values(stats).reduce((acc, s) => acc + s.failed, 0);
  console.log(`[backfill] Done at ${new Date().toISOString()}`);
  console.log('========================================\n');

  // Surface failures via non-zero exit so the workflow's failure step alerts.
  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(process.exitCode || 0)))
  .catch(async (err) => {
    console.error('[backfill] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
