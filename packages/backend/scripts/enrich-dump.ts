/**
 * Custom dump for verifying prompt changes — runs enrichOneEvent in dry-run
 * mode and prints each fight's pace / storylines / styleTags / stakes.
 *
 * Usage:
 *   npx tsx packages/backend/scripts/enrich-dump.ts --event-id <id>
 */
import { PrismaClient } from '@prisma/client';
import {
  launchPreviewBrowser,
  closePreviewBrowser,
  fetchUFCEventPreview,
} from '../src/services/aiEnrichment/fetchUFCEventPreview';
import { fetchTapologyEventPreview } from '../src/services/aiEnrichment/fetchTapologyEventPreview';
import { fetchEditorialPreviews } from '../src/services/aiEnrichment/fetchEditorialPreviews';
import {
  extractFightEnrichment,
  type CardItem,
} from '../src/services/aiEnrichment/extractFightEnrichment';

async function loadCard(prisma: PrismaClient, eventId: string): Promise<CardItem[]> {
  const fights = await prisma.fight.findMany({
    where: { eventId, fightStatus: 'UPCOMING' },
    include: {
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
    },
    orderBy: { orderOnCard: 'asc' },
  });
  return fights.map((f) => ({
    fightId: f.id,
    fighter1: `${f.fighter1.firstName} ${f.fighter1.lastName}`.trim(),
    fighter2: `${f.fighter2.firstName} ${f.fighter2.lastName}`.trim(),
    weightClass: f.weightClass ?? null,
    cardSection: f.cardType ?? null,
    orderOnCard: f.orderOnCard ?? null,
    isMainEvent: f.orderOnCard === 1,
    isTitle: !!f.isTitle,
  }));
}

(async () => {
  const idxArg = process.argv.indexOf('--event-id');
  if (idxArg < 0) {
    console.error('--event-id <id> required');
    process.exit(2);
  }
  const eventId = process.argv[idxArg + 1];
  const prisma = new PrismaClient();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    console.error('Event not found');
    process.exit(1);
  }
  const card = await loadCard(prisma, eventId);
  console.log(`Event: ${event.promotion} | ${event.name} | ${event.date.toISOString().slice(0, 10)}`);
  console.log(`Card size: ${card.length}`);

  const isUfcCom = /(^|\.)ufc\.com\b/i.test(event.ufcUrl ?? '');
  const isTapology = /(^|\.)tapology\.com\b/i.test(event.ufcUrl ?? '');
  const sources: Array<{ url: string; text: string; label?: string }> = [];
  const handle = isUfcCom ? await launchPreviewBrowser() : undefined;
  try {
    if (isUfcCom && handle) {
      try {
        const snap = await fetchUFCEventPreview(event.ufcUrl!, handle);
        if (snap) sources.push({ url: snap.finalUrl, text: snap.text, label: 'ufc.com' });
      } catch (e: any) {
        console.log(`[ufc.com fetch failed in dump (tsx issue): ${e.message?.slice(0, 80)}] — continuing with editorial only`);
      }
    } else if (isTapology) {
      const snap = await fetchTapologyEventPreview(event.ufcUrl!);
      if (snap) sources.push({ url: snap.finalUrl, text: snap.text, label: 'tapology.com' });
    }
    const editorial = await fetchEditorialPreviews(event.name, undefined, { topN: 3 });
    for (const s of editorial) sources.push({ url: s.url, text: s.text, label: s.domain });

    console.log(`Sources: ${sources.length}`);
    for (const s of sources) console.log(`  - ${s.label}: ${s.text.length} chars`);

    if (sources.length === 0) {
      console.log('NO SOURCES — skipping LLM call');
      return;
    }

    const result = await extractFightEnrichment({
      promotion: event.promotion,
      eventName: event.name,
      eventDate: event.date.toISOString().slice(0, 10),
      card,
      sources,
    });

    const byId = new Map(card.map((c) => [c.fightId, c]));
    console.log(`\nLLM enriched ${result.fights.length}/${card.length} fights\n`);
    let paceCount = 0;
    const paceDist: Record<string, number> = {};
    let rematchCount = 0;
    let styleClashCount = 0;
    for (const r of result.fights) {
      const c = byId.get(r.fightId);
      if (!c) continue;
      const hasRematch = r.storylines.some((s) => /\b(rematch|trilogy|unfinished)\b/i.test(s));
      const hasStyleClash = r.styleTags.some((t) => /\b(?:vs\.?|versus)\b/i.test(t));
      if (r.pace) {
        paceCount++;
        paceDist[r.pace] = (paceDist[r.pace] ?? 0) + 1;
      }
      if (hasRematch) rematchCount++;
      if (hasStyleClash) styleClashCount++;
      console.log(`# ${c.fighter1} vs ${c.fighter2} ${c.isMainEvent ? '★MAIN' : ''}`);
      console.log(`  pace: ${r.pace ?? 'null'}  | styleTags: ${JSON.stringify(r.styleTags)}`);
      console.log(`  stakes: ${JSON.stringify(r.stakes)}`);
      console.log(`  storylines: ${JSON.stringify(r.storylines)}`);
      console.log(`  whyCare: ${r.whyCare}`);
      console.log(`  confidence: ${r.confidence}`);
      console.log('');
    }
    console.log('---');
    console.log(`Pace populated: ${paceCount}/${result.fights.length}  dist=${JSON.stringify(paceDist)}`);
    console.log(`Rematch token in storylines: ${rematchCount}/${result.fights.length}`);
    console.log(`Style clash (X vs Y) in styleTags: ${styleClashCount}/${result.fights.length}`);
    const u = result.usage;
    console.log(`Tokens: in=${u.inputTokens} out=${u.outputTokens} cacheW=${u.cacheCreationInputTokens} cacheR=${u.cacheReadInputTokens}`);
  } finally {
    if (handle) await closePreviewBrowser(handle);
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
