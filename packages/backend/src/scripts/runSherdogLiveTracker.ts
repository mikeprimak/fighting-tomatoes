/**
 * Sherdog Live Tracker - Runner
 *
 * One-shot script: fetch Sherdog play-by-play for a given event, reconcile
 * against DB, exit. Designed to be called repeatedly (every 60-90s) by a
 * scheduler — cron, GH Actions workflow, or the eventLifecycle dispatch.
 *
 * Usage:
 *   npx tsx src/scripts/runSherdogLiveTracker.ts \
 *     --event-id <UUID> \
 *     --pbp-url <https://www.sherdog.com/news/news/...> \
 *     [--dry-run] \
 *     [--null-only-results] \
 *     [--skip-notifications]
 *
 * Env vars (alternative to flags):
 *   SHERDOG_EVENT_ID, SHERDOG_PBP_URL, SHERDOG_DRY_RUN=1
 *
 * Exit codes:
 *   0 — success (parsed + applied or dry-run completed)
 *   1 — fatal error (no PBP page, scrape failure, bad event ID, etc.)
 */

import { PrismaClient } from '@prisma/client';
import { SherdogLiveScraper } from '../services/sherdogLiveScraper';
import { parseSherdogLiveData } from '../services/sherdogLiveParser';
import { refreshProductionScrapersCache, isProductionScraper } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

interface CliArgs {
  eventId: string | null;
  pbpUrl: string | null;
  dryRun: boolean;
  nullOnlyResults: boolean;
  skipNotifications: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    eventId: process.env.SHERDOG_EVENT_ID || null,
    pbpUrl: process.env.SHERDOG_PBP_URL || null,
    dryRun: process.env.SHERDOG_DRY_RUN === '1',
    nullOnlyResults: false,
    skipNotifications: false,
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--event-id') args.eventId = argv[++i];
    else if (a === '--pbp-url') args.pbpUrl = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--null-only-results') args.nullOnlyResults = true;
    else if (a === '--skip-notifications') args.skipNotifications = true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  console.log('\n========================================');
  console.log('[SHERDOG TRACKER] Runner');
  console.log(`[SHERDOG TRACKER] Started: ${new Date().toISOString()}`);
  console.log(`[SHERDOG TRACKER] Mode: ${args.dryRun ? 'DRY-RUN (read-only)' : 'APPLY'}`);
  console.log('========================================\n');

  if (!args.eventId || !args.pbpUrl) {
    console.error('❌ Missing required args. Need --event-id and --pbp-url (or env vars).');
    process.exit(1);
  }

  // Hydrate production-scraper cache from SystemConfig so the parser's
  // shouldAutoPublish() reflects admin-toggled state. Without this, the
  // default cache is used and 'tapology' may not auto-publish even when
  // SystemConfig says it should.
  await refreshProductionScrapersCache(prisma);

  // Explicit select so we're not dependent on the local Prisma client and
  // the prod DB being in lockstep — when a new column is added to the schema
  // but the migration hasn't deployed yet, default findUnique selects all
  // columns including the new one and errors with P2022.
  const event = await prisma.event.findUnique({
    where: { id: args.eventId },
    select: { id: true, name: true, scraperType: true, eventStatus: true },
  });
  if (!event) {
    console.error(`❌ Event not found: ${args.eventId}`);
    process.exit(1);
  }
  console.log(`[SHERDOG TRACKER] Event: ${event.name}`);
  console.log(`[SHERDOG TRACKER] Scraper: ${event.scraperType} (production=${isProductionScraper(event.scraperType)})`);
  console.log(`[SHERDOG TRACKER] PBP URL: ${args.pbpUrl}\n`);

  // === Scrape ===
  const scraper = new SherdogLiveScraper(args.pbpUrl);
  const liveData = await scraper.scrape();
  if (!liveData) {
    console.error('❌ Sherdog returned no PBP page (404 or empty). Aborting.');
    process.exit(1);
  }

  // === Parse + reconcile ===
  const result = await parseSherdogLiveData(liveData, args.eventId, {
    dryRun: args.dryRun,
    nullOnlyResults: args.nullOnlyResults,
    skipNotifications: args.skipNotifications,
  });

  console.log('========================================');
  console.log(`[SHERDOG TRACKER] Result: ${result.fightsUpdated} fight rows touched`);
  console.log(`  - ${result.fightsStarted} fight(s) → LIVE`);
  console.log(`  - ${result.fightsCompleted} fight(s) → COMPLETED`);
  console.log(`  - ${result.resultsBackfilled} pre-completed result(s) backfilled`);
  console.log(`  - Event updated: ${result.eventUpdated}`);
  console.log('========================================\n');

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error('[SHERDOG TRACKER] Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
