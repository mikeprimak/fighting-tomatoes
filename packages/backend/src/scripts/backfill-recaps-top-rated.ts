/**
 * Pass (b) of the character backfill: generate recaps (+ character tags, the
 * post-fight extractor emits both) for the most-rated COMPLETED fights that
 * have NO stored recap. Approved 2026-06-11: top 2000 by totalRatings.
 *
 * Runs the existing event-scoped pipeline (enrichOnePostFightEvent): one Brave
 * recap search + one Haiku call per EVENT covers every recap-less fight on the
 * card, so ride-along fights get enriched for free. ~495 events span the top
 * 2000 target fights.
 *
 * Differences from the T+5d cron path:
 *   - editorialFreshness 'all' (historic recaps are years old; any freshness
 *     window returns nothing).
 *   - NO ufc.com browser fetch — home-IP requests get rate-limited after a few
 *     hundred (lesson_ufc_cdn_rate_limits_home_ip); Brave editorial is the source.
 *   - Budget + target caps; ~1.2s pacing between events (Brave free tier 1 rps).
 *
 * Default is DRY-RUN (still spends pennies on the events it processes).
 * Usage (from packages/backend/):
 *   npx tsx src/scripts/backfill-recaps-top-rated.ts --events 2          (dry-run sample)
 *   npx tsx src/scripts/backfill-recaps-top-rated.ts --persist           (full run)
 *   --target N     how many top-rated fights to chase (default 2000)
 *   --budget USD   hard stop on LLM spend (default 60)
 *   --events N     process at most N events (testing)
 */
import { prisma } from '../lib/prisma';
import { enrichOnePostFightEvent } from '../services/aiEnrichment/postFight/enrichOnePostFightEvent';

const PACE_MS = 1_200;
const MAX_RETRIES = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const is429 = e?.status === 429 || /rate_limit/i.test(String(e?.message ?? ''));
      if (!is429 || attempt >= MAX_RETRIES) throw e;
      const backoff = 30_000 * (attempt + 1);
      console.log(`  429 rate limit, backing off ${backoff / 1000}s ...`);
      await sleep(backoff);
    }
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const persist = flag('persist');
  const target = arg('target') ? Number(arg('target')) : 2000;
  const budgetUsd = arg('budget') ? Number(arg('budget')) : 60;
  const maxEvents = arg('events') ? Number(arg('events')) : undefined;

  const targets = await prisma.fight.findMany({
    where: {
      fightStatus: 'COMPLETED',
      winner: { not: null },
      aiPostFightSummary: null,
      aiPostFightEnrichedAt: null,
      totalRatings: { gte: 1 },
    },
    select: { id: true, eventId: true, totalRatings: true },
    orderBy: { totalRatings: 'desc' },
    take: target,
  });
  const targetIds = new Set(targets.map((t) => t.id));

  // Events ranked by their best (first-seen) target fight.
  const eventIds: string[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    if (!seen.has(t.eventId)) {
      seen.add(t.eventId);
      eventIds.push(t.eventId);
    }
  }
  const queue = maxEvents ? eventIds.slice(0, maxEvents) : eventIds;

  console.log(
    `${targets.length} target fights across ${eventIds.length} events; ` +
      `processing ${queue.length} ${persist ? '(PERSIST)' : '(dry-run)'} ` +
      `budget $${budgetUsd}`,
  );

  let costUsd = 0;
  let wroteTotal = 0;
  let targetCovered = 0;
  let eventsDone = 0;
  const failures: string[] = [];

  for (const eventId of queue) {
    if (costUsd >= budgetUsd) {
      console.log(`\nBudget cap $${budgetUsd} reached — stopping.`);
      break;
    }
    try {
      const r = await withRateLimitRetry(() =>
        enrichOnePostFightEvent(prisma, eventId, {
          dryRun: !persist,
          editorialFreshness: 'all',
          editorialTopN: 3,
        }),
      );
      costUsd += r.costUsd;
      wroteTotal += r.wroteCount;
      const hits = r.persistResult.writtenFightIds.filter((id) => targetIds.has(id)).length;
      targetCovered += hits;
      eventsDone++;
      const tag = r.abortedReason ? `ABORT(${r.abortedReason})` : `${r.wroteCount} wrote (${hits} target)`;
      console.log(
        `[${eventsDone}/${queue.length}] ${r.eventName}  → card ${r.cardSize}, ` +
          `${r.sourcesFetched.length} sources, ${tag}, $${r.costUsd.toFixed(4)} ` +
          `(total $${costUsd.toFixed(2)}, ${targetCovered}/${targets.length} target)`,
      );
    } catch (e: any) {
      eventsDone++;
      failures.push(`${eventId}: ${e?.message ?? e}`);
      console.error(`[${eventsDone}/${queue.length}] ${eventId} FAILED: ${e?.message ?? e}`);
    }
    await sleep(PACE_MS);
  }

  console.log(
    `\nDone: ${eventsDone} events, ${wroteTotal} fights written, ` +
      `${targetCovered}/${targets.length} target fights covered, ` +
      `$${costUsd.toFixed(2)} spent, ${failures.length} failures`,
  );
  if (failures.length) console.log(failures.slice(0, 10).join('\n'));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
