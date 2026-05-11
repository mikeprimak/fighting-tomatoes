/**
 * Seed MVP per-event broadcasts for the three upcoming MVP cards.
 * MVP has no PromotionBroadcastDefault rows by design — Netflix vs ESPN vs Sky varies
 * per card — so each event needs explicit EventBroadcast rows or the HowToWatch UI
 * renders empty.
 *
 * Sources (verified 2026-05-11):
 *  - MVP MMA 1 (May 16): https://www.netflix.com/tudum/features/ronda-rousey-gina-carano-mma-live-on-netflix
 *    Global on Netflix — no PPV upcharge.
 *  - MVPW 03 (May 30): https://athlonsports.com/boxing/holly-holm-vs-stephanie-han-how-to-watch
 *    ESPN/ESPN+ (US) + Sky Sports (UK).
 *  - MVPW 04 (June 13): https://www.espn.com/boxing/story?id=48618711
 *    ESPN+ (US) + Sky Sports (UK).
 *
 * Idempotent — wipes-then-recreates each event's rows on every run.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Tier = 'FREE' | 'SUBSCRIPTION' | 'PPV';
type Section = 'EARLY_PRELIMS' | 'PRELIMS' | 'MAIN_CARD' | null;

interface EventConfig {
  id: string;
  label: string;
  rows: { region: string; section: Section; channelSlug: string; tier: Tier; note?: string }[];
}

const EVENTS: EventConfig[] = [
  // ---- MVP MMA 1: Rousey vs. Carano (May 16 2026) — global on Netflix ----
  {
    id: '8a9ead55-657b-4175-845b-b63829f46581',
    label: 'MVP MMA 1: Rousey vs. Carano',
    rows: [
      { region: 'US', section: null, channelSlug: 'netflix', tier: 'SUBSCRIPTION', note: 'Live on Netflix — no extra cost for subscribers' },
      { region: 'CA', section: null, channelSlug: 'netflix', tier: 'SUBSCRIPTION', note: 'Live on Netflix — no extra cost for subscribers' },
      { region: 'GB', section: null, channelSlug: 'netflix', tier: 'SUBSCRIPTION', note: 'Live on Netflix — no extra cost for subscribers' },
      { region: 'AU', section: null, channelSlug: 'netflix', tier: 'SUBSCRIPTION', note: 'Live on Netflix — no extra cost for subscribers' },
      { region: 'NZ', section: null, channelSlug: 'netflix', tier: 'SUBSCRIPTION', note: 'Live on Netflix — no extra cost for subscribers' },
      { region: 'EU', section: null, channelSlug: 'netflix', tier: 'SUBSCRIPTION', note: 'Live on Netflix — no extra cost for subscribers' },
    ],
  },
  // ---- MVPW 03: Han vs. Holm II (May 30 2026) — ESPN/ESPN+ US, Sky Sports UK ----
  {
    id: '89b8c5c8-42ee-4208-89c0-c5e3211c2563',
    label: 'MVPW 03: Han vs. Holm II',
    rows: [
      { region: 'US', section: null, channelSlug: 'espn-plus',  tier: 'SUBSCRIPTION', note: 'ESPN+ — also linear ESPN' },
      { region: 'GB', section: null, channelSlug: 'sky-sports', tier: 'SUBSCRIPTION' },
    ],
  },
  // ---- MVPW 4 (June 13 2026) — ESPN+ US, Sky Sports UK ----
  {
    id: '7ef47828-2850-4ee0-9e16-f082979b8c1a',
    label: 'MVPW 4',
    rows: [
      { region: 'US', section: null, channelSlug: 'espn-plus',  tier: 'SUBSCRIPTION' },
      { region: 'GB', section: null, channelSlug: 'sky-sports', tier: 'SUBSCRIPTION' },
    ],
  },
];

(async () => {
  const allSlugs = Array.from(new Set(EVENTS.flatMap(e => e.rows.map(r => r.channelSlug))));
  const channels = await prisma.broadcastChannel.findMany({
    where: { slug: { in: allSlugs } },
    select: { id: true, slug: true },
  });
  const slugToId = new Map(channels.map(c => [c.slug, c.id]));
  for (const slug of allSlugs) {
    if (!slugToId.has(slug)) throw new Error(`Missing BroadcastChannel for slug "${slug}"`);
  }

  for (const ev of EVENTS) {
    const exists = await prisma.event.findUnique({ where: { id: ev.id }, select: { id: true, name: true } });
    if (!exists) {
      console.warn(`SKIP ${ev.label}: event ${ev.id} not found in DB`);
      continue;
    }

    const wiped = await prisma.eventBroadcast.deleteMany({ where: { eventId: ev.id } });
    console.log(`\n=== ${ev.label} (${exists.name}) ===`);
    console.log(`Wiped ${wiped.count} existing rows.`);

    for (const r of ev.rows) {
      const channelId = slugToId.get(r.channelSlug)!;
      const created = await prisma.eventBroadcast.create({
        data: {
          eventId: ev.id,
          channelId,
          region: r.region,
          cardSection: r.section,
          tier: r.tier,
          note: r.note ?? null,
          source: 'MANUAL',
        },
        select: { id: true },
      });
      console.log(`  ${r.region.padEnd(3)} ${(r.section ?? 'ALL').padEnd(14)} ${r.channelSlug.padEnd(18)} ${r.tier.padEnd(13)} ${created.id}`);
    }
  }

  console.log('\n=== Verify by region (MVP MMA 1) ===');
  for (const region of ['US', 'CA', 'GB', 'AU', 'NZ', 'EU']) {
    const rows = await prisma.eventBroadcast.findMany({
      where: { eventId: EVENTS[0].id, region },
      include: { channel: { select: { slug: true } } },
    });
    console.log(`  ${region}: ${rows.map(r => r.channel.slug).join(', ') || '(none)'}`);
  }

  await prisma.$disconnect();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
