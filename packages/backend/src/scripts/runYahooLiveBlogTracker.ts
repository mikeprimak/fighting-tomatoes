/**
 * Yahoo Live-Blog Tracker — Runner (boxing live tracker)
 *
 * One-shot: fetch a Yahoo / Uncrowned boxing live-blog page, parse the
 * canonical "{Winner} def. {Loser} by {METHOD} ({scores})" recap into
 * structured results, reconcile against a DB event, exit. Designed to be
 * called repeatedly (every 60-90s) by a scheduler — in-session cron tonight,
 * VPS/lifecycle dispatch once validated.
 *
 * Reuses the promotion-agnostic `parseSherdogLiveData` reconciler (same
 * COMPLETED-never-reversed guards, last-name matching, backfill safety) with
 * completionMethodOverride='yahoo-tracker' for the audit trail.
 *
 * Usage:
 *   npx tsx src/scripts/runYahooLiveBlogTracker.ts \
 *     --event-id <UUID> \
 *     --url <https://sports.yahoo.com/boxing/live/...> \
 *     [--dry-run] [--null-only-results] [--skip-notifications]
 *
 * Env vars (alternative to flags):
 *   YAHOO_EVENT_ID, YAHOO_LIVEBLOG_URL, YAHOO_DRY_RUN=1
 *
 * Exit codes: 0 success (applied or dry-run); 1 fatal (bad args/event, scrape error).
 */

import { PrismaClient } from '@prisma/client';
import { YahooLiveBlogScraper } from '../services/yahooLiveBlogScraper';
import { parseSherdogLiveData } from '../services/sherdogLiveParser';
import { refreshProductionScrapersCache } from '../config/liveTrackerConfig';

const prisma = new PrismaClient();

interface CliArgs {
  eventId: string | null;
  url: string | null;
  dryRun: boolean;
  nullOnlyResults: boolean;
  skipNotifications: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    eventId: process.env.YAHOO_EVENT_ID || null,
    url: process.env.YAHOO_LIVEBLOG_URL || null,
    dryRun: process.env.YAHOO_DRY_RUN === '1',
    nullOnlyResults: false,
    skipNotifications: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--event-id') args.eventId = argv[++i];
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--null-only-results') args.nullOnlyResults = true;
    else if (a === '--skip-notifications') args.skipNotifications = true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  console.log('\n========================================');
  console.log('[YAHOO TRACKER] Runner');
  console.log(`[YAHOO TRACKER] Started: ${new Date().toISOString()}`);
  console.log(`[YAHOO TRACKER] Mode: ${args.dryRun ? 'DRY-RUN (read-only)' : 'APPLY'}`);
  console.log('========================================\n');

  if (!args.eventId || !args.url) {
    console.error('❌ Missing required args. Need --event-id and --url (or env vars).');
    process.exit(1);
  }

  await refreshProductionScrapersCache(prisma);

  const event = await prisma.event.findUnique({
    where: { id: args.eventId },
    select: { id: true, name: true, scraperType: true, eventStatus: true },
  });
  if (!event) {
    console.error(`❌ Event not found: ${args.eventId}`);
    process.exit(1);
  }
  console.log(`[YAHOO TRACKER] Event: ${event.name} (status=${event.eventStatus})`);
  console.log(`[YAHOO TRACKER] URL: ${args.url}\n`);

  // === Scrape ===
  const scraper = new YahooLiveBlogScraper(args.url);
  const liveData = await scraper.scrape();
  if (!liveData) {
    console.error('❌ Yahoo returned no data (403/404/empty). Aborting this cycle.');
    process.exit(1);
  }

  // === Parse + reconcile (reuse the Sherdog reconciler, Yahoo audit label) ===
  const result = await parseSherdogLiveData(liveData, args.eventId, {
    dryRun: args.dryRun,
    nullOnlyResults: args.nullOnlyResults,
    skipNotifications: args.skipNotifications,
    completionMethodOverride: 'yahoo-tracker',
    // Result backfill only. Main-card results don't reliably reach the `def.`
    // recap, so we DON'T drive notifications off recap-completions — the
    // narrative detector below is the notification source instead.
  });

  console.log('========================================');
  console.log(`[YAHOO TRACKER] Result: ${result.fightsUpdated} fight rows touched`);
  console.log(`  - ${result.fightsCompleted} fight(s) → COMPLETED`);
  console.log(`  - ${result.resultsBackfilled} pre-completed result(s) backfilled`);
  console.log('========================================');

  // Narrative-based live-fight detection — the reliable start signal. Yahoo's
  // newest posts are about the fight currently in the ring; the `def.` recap
  // lags/skips the main card. We find the fight whose BOTH fighters are named
  // in the recent posts, complete everything earlier in the card, set it LIVE,
  // and fire its "up next"/walkout notification once.
  if (!args.dryRun && !args.skipNotifications && liveData.recentText) {
    await detectAndNotifyLiveFight(args.eventId, liveData.recentText);
  }

  await prisma.$disconnect();
}

async function detectAndNotifyLiveFight(eventId: string, recentText: string): Promise<void> {
  const txt = recentText.toLowerCase();
  const present = (lastName: string) => {
    const l = (lastName || '').toLowerCase();
    return l.length >= 3 && txt.includes(l);
  };

  const fights = await prisma.fight.findMany({
    where: { eventId, fightStatus: { in: ['UPCOMING', 'LIVE'] } },
    include: {
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
    },
    orderBy: { orderOnCard: 'asc' },
  });

  // The live fight = the one whose BOTH fighters are named in the recent posts.
  // Prefer the lowest orderOnCard (closest to the main event) if more than one
  // matches — narration of the next fight starts while the previous lingers.
  const live = fights.find((f) => present(f.fighter1.lastName) && present(f.fighter2.lastName));
  if (!live || live.orderOnCard === null) {
    console.log('[YAHOO TRACKER] No live fight identified in recent posts this cycle.');
    return;
  }

  const fmt = (f: { firstName: string; lastName: string }) =>
    f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : f.lastName || f.firstName;
  const label = `${fmt(live.fighter1)} vs ${fmt(live.fighter2)}`;

  // Everything earlier in the card (higher orderOnCard) is finished — complete
  // any still-open rows (winners backfill later from the recap / BoxRec).
  const passed = await prisma.fight.updateMany({
    where: {
      eventId,
      orderOnCard: { gt: live.orderOnCard },
      fightStatus: { in: ['UPCOMING', 'LIVE'] },
    },
    data: { fightStatus: 'COMPLETED', completionMethod: 'yahoo-narrative-passed', completedAt: new Date() },
  });
  if (passed.count) console.log(`[YAHOO TRACKER] Completed ${passed.count} earlier fight(s) the broadcast moved past.`);

  if (live.fightStatus === 'LIVE') {
    console.log(`[YAHOO TRACKER] Live fight unchanged: ${label} (already LIVE, notif already sent).`);
    return;
  }

  // Newly live → set LIVE + fire its notification (once).
  await prisma.fight.update({
    where: { id: live.id },
    data: { fightStatus: 'LIVE', trackerFightStatus: 'LIVE', trackerUpdatedAt: new Date() },
  });
  try {
    const { notifyFightStartViaRules } = await import('../services/notificationService');
    await notifyFightStartViaRules(live.id, fmt(live.fighter1), fmt(live.fighter2));
    console.log(`[YAHOO TRACKER] 🔔 ${label} → LIVE + up-next notification fired.`);
  } catch (err: any) {
    console.error(`[YAHOO TRACKER] notif failed for ${label}: ${err.message}`);
  }
}

main().catch(async (err) => {
  console.error('[YAHOO TRACKER] Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
