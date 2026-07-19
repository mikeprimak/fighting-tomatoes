/**
 * Pundit-quote dry run — spot-check the "What the media said" extraction against
 * a real card BEFORE trusting it in the Phase 6 cron path.
 *
 * Prints every quote the model proposed, whether it survived the verbatim
 * substring check, and why it failed if it didn't. Nothing is written unless
 * you pass --persist, so this is safe to run repeatedly.
 *
 * The point of this script is the rejection list. A healthy run rejects some
 * quotes — that is the guard working. A run where EVERYTHING is rejected means
 * the source text and the model's view of it have diverged (fetcher change,
 * text cap, encoding), and a run where nothing is ever rejected is worth
 * distrusting.
 *
 * Usage (from packages/backend/):
 *   npx tsx src/scripts/dry-run-pundit-quotes.ts --event "UFC 329"
 *   npx tsx src/scripts/dry-run-pundit-quotes.ts --event-id <uuid> --persist
 */
import { prisma } from '../lib/prisma';
import { enrichOnePostFightEvent } from '../services/aiEnrichment/postFight/enrichOnePostFightEvent';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const persist = process.argv.includes('--persist');
  const eventId = arg('--event-id');
  const eventName = arg('--event');

  if (!eventId && !eventName) {
    console.error('Pass --event "UFC 329" or --event-id <uuid>.');
    process.exitCode = 1;
    return;
  }

  const event = eventId
    ? await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, date: true } })
    : await prisma.event.findFirst({
        where: { name: { contains: eventName!, mode: 'insensitive' }, eventStatus: 'COMPLETED' },
        orderBy: { date: 'desc' },
        select: { id: true, name: true, date: true },
      });

  if (!event) {
    console.error(`No completed event matched ${eventId ?? eventName}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nEvent: ${event.name}  (${event.date.toISOString().slice(0, 10)})`);
  console.log(persist ? 'MODE: PERSIST (will write)\n' : 'MODE: dry run (no writes)\n');

  const result = await enrichOnePostFightEvent(prisma, event.id, {
    dryRun: !persist,
    // Recaps for an older fixture are outside the past-month window.
    editorialFreshness: 'all',
  });

  if (result.abortedReason) {
    console.log(`Aborted: ${result.abortedReason}`);
    console.log('(Fights already carrying aiPostFightEnrichedAt are skipped — that gate is per-fight.)');
    return;
  }

  console.log('Sources fetched:');
  for (const s of result.sourcesFetched) {
    console.log(`  ${String(s.chars).padStart(6)} chars  ${s.label}  ${s.url}`);
  }

  console.log(`\nQuote-eligible bouts: ${result.quoteEligibleFightIds.length}`);

  const q = result.persistResult.punditQuotes;
  console.log('\n=== PUNDIT QUOTES ===');
  console.log(`proposed=${q.proposed}  verified=${q.verified}  written=${q.written}  excludedPundit=${q.skippedExcluded}`);

  if (q.rejected.length) {
    console.log('\nREJECTED (dropped, never shown):');
    for (const r of q.rejected) {
      console.log(`  [${r.reason}${r.foundInUrl ? ` -> actually in ${r.foundInUrl}` : ''}] ${r.speaker}`);
      console.log(`      "${r.quote.slice(0, 120)}"`);
    }
  }

  if (!persist && q.verified > 0) {
    console.log('\n(Verified quote text is written only with --persist; re-run with it to inspect stored rows.)');
  }

  if (persist) {
    const rows = await prisma.punditQuote.findMany({
      where: { fightId: { in: result.quoteEligibleFightIds } },
      include: { pundit: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    console.log('\nSTORED:');
    for (const r of rows) {
      console.log(`  "${r.quote}"`);
      console.log(`      — ${r.pundit.name} (${r.pundit.role}), via ${r.outlet}  conf=${r.aiConfidence}  ${r.sourceUrl}`);
    }
  }

  console.log(`\nCost: $${result.costUsd.toFixed(4)}   Recaps written: ${result.wroteCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
