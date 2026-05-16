/**
 * Single-event enrichment CLI — wraps enrichOneEvent for manual / dev runs.
 *
 * Usage:
 *   npx ts-node packages/backend/scripts/enrich-event.ts --event-id <id>
 *   npx ts-node packages/backend/scripts/enrich-event.ts --next
 *   npx ts-node packages/backend/scripts/enrich-event.ts --next-ufc
 *   add --persist to write (default dry-run), --json for full extract dump.
 */

import { PrismaClient } from '@prisma/client';
import {
  launchPreviewBrowser,
  closePreviewBrowser,
} from '../src/services/aiEnrichment/fetchUFCEventPreview';
import { enrichOneEvent } from '../src/services/aiEnrichment/enrichOneEvent';

function parseArgs(argv: string[]): {
  eventId?: string;
  next: boolean;
  nextUfc: boolean;
  persist: boolean;
  showJson: boolean;
} {
  const out = { next: false, nextUfc: false, persist: false, showJson: false } as ReturnType<typeof parseArgs>;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--event-id') out.eventId = argv[++i];
    else if (a === '--next') out.next = true;
    else if (a === '--next-ufc') out.nextUfc = true;
    else if (a === '--persist') out.persist = true;
    else if (a === '--json') out.showJson = true;
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  let event;
  if (args.eventId) {
    event = await prisma.event.findUnique({ where: { id: args.eventId } });
    if (!event) throw new Error(`Event ${args.eventId} not found`);
  } else if (args.nextUfc) {
    event = await prisma.event.findFirst({
      where: { promotion: 'UFC', eventStatus: 'UPCOMING', ufcUrl: { not: null } },
      orderBy: { date: 'asc' },
    });
    if (!event) throw new Error('No upcoming UFC event found');
  } else if (args.next) {
    event = await prisma.event.findFirst({
      where: { eventStatus: 'UPCOMING', ufcUrl: { not: null } },
      orderBy: { date: 'asc' },
    });
    if (!event) throw new Error('No upcoming event found');
  } else {
    console.error('Provide --event-id <id>, --next, or --next-ufc');
    process.exit(2);
  }

  console.error(`[enrich] ${event.promotion} | ${event.name} | ${event.date.toISOString().slice(0, 10)}`);
  console.error(`[enrich] source URL on file: ${event.ufcUrl ?? '(none)'}`);

  // Launch Puppeteer only for ufc.com events.
  const isUfcCom = /(^|\.)ufc\.com\b/i.test(event.ufcUrl ?? '');
  const browserHandle = isUfcCom ? await launchPreviewBrowser() : undefined;

  try {
    const result = await enrichOneEvent(prisma, event.id, {
      dryRun: !args.persist,
      browserHandle,
    });

    for (const s of result.sourcesFetched) {
      console.error(`[enrich] source ${s.label}: ${s.chars} chars`);
    }

    if (result.abortedReason) {
      console.error(`[enrich] aborted: ${result.abortedReason}`);
    } else {
      console.error(
        `[enrich] ${result.fightsExtracted} fights, ${result.elapsedMs}ms, ~$${result.costUsd.toFixed(4)}`,
      );
      console.error(
        `[enrich] coverage: ${result.fightsWithNarrative}/${result.fightsExtracted} fights got narrative fields`,
      );
      console.error(
        `[enrich] match: ${result.matched} matched, ${result.unmatched} unmatched (LLM had no DB row), ` +
          `${result.uncoveredDbFightIds.length} uncovered (UPCOMING DB rows with no LLM coverage)`,
      );
      for (const m of result.persistResult.matched) {
        console.error(
          `  ✓ ${m.llmRed} vs ${m.llmBlue}  →  ${m.dbRed} vs ${m.dbBlue}  ` +
            `(score=${m.score.toFixed(2)}${m.flipped ? ', flipped' : ''})`,
        );
      }
      for (const u of result.persistResult.unmatchedRecords) {
        console.error(`  ✗ no DB row for: ${u.redFighter} vs ${u.blueFighter}`);
      }
      if (args.persist) {
        console.error(`[enrich] wrote ${result.wroteCount} rows`);
      } else {
        console.error('[enrich] DRY RUN — pass --persist to write to DB');
      }
    }

    if (args.showJson) {
      console.log(JSON.stringify(result.persistResult, null, 2));
    }
  } finally {
    if (browserHandle) await closePreviewBrowser(browserHandle);
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error('[enrich-event] fatal:', err);
  process.exit(1);
});
