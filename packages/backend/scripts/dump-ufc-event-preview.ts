/**
 * Dump the raw text we'd feed an LLM for a given UFC event preview page.
 * Used to eyeball signal quality before wiring up the enrichment pipeline.
 *
 * Usage:
 *   npx ts-node packages/backend/scripts/dump-ufc-event-preview.ts <ufcUrl>
 *   npx ts-node packages/backend/scripts/dump-ufc-event-preview.ts --event-id <id>
 *   npx ts-node packages/backend/scripts/dump-ufc-event-preview.ts --next
 *
 *   --next  picks the next UPCOMING UFC event with a non-null ufcUrl.
 */

import { PrismaClient } from '@prisma/client';
import {
  launchPreviewBrowser,
  closePreviewBrowser,
  fetchUFCEventPreview,
} from '../src/services/aiEnrichment/fetchUFCEventPreview';

function parseArgs(argv: string[]): { url?: string; eventId?: string; next: boolean } {
  const out: { url?: string; eventId?: string; next: boolean } = { next: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--event-id') out.eventId = argv[++i];
    else if (a === '--next') out.next = true;
    else if (!out.url && /^https?:\/\//.test(a)) out.url = a;
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  let url = args.url;
  if (!url && args.eventId) {
    const ev = await prisma.event.findUnique({ where: { id: args.eventId } });
    if (!ev?.ufcUrl) throw new Error(`Event ${args.eventId} has no ufcUrl`);
    url = ev.ufcUrl;
  }
  if (!url && args.next) {
    const ev = await prisma.event.findFirst({
      where: { promotion: 'UFC', eventStatus: 'UPCOMING', ufcUrl: { not: null } },
      orderBy: { date: 'asc' },
    });
    if (!ev?.ufcUrl) throw new Error('No upcoming UFC event with ufcUrl found');
    url = ev.ufcUrl;
    console.error(`[dump] using next UPCOMING UFC event: ${ev.name} → ${url}`);
  }
  if (!url) {
    console.error('Provide a ufcUrl, --event-id <id>, or --next');
    process.exit(2);
  }

  const handle = await launchPreviewBrowser();
  try {
    const snap = await fetchUFCEventPreview(url, handle);
    if (!snap) {
      console.error('[dump] fetch returned null — see warnings above');
      process.exit(1);
    }
    console.error(`[dump] ${snap.text.length} chars from ${snap.finalUrl}`);
    console.log(snap.text);
  } finally {
    await closePreviewBrowser(handle);
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error('[dump-ufc-event-preview] fatal:', err);
  process.exit(1);
});
