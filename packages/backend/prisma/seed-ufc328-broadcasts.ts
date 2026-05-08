/**
 * Seed UFC 328 (Chimaev vs Strickland, May 9 2026) broadcaster rows for every region.
 * Source: ufc.com/news/how-watch-and-stream-ufc + Paramount+ official + comparitech
 * verified 2026-05-08.
 *
 * Idempotent — uses upsert keyed on (eventId, channelId, region, cardSection).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EVENT_ID = 'b992560c-fe62-417b-8953-e3323cdf7b2a';

type Section = 'EARLY_PRELIMS' | 'PRELIMS' | 'MAIN_CARD';
type Tier = 'FREE' | 'SUBSCRIPTION' | 'PPV';

const NEW_CHANNELS = [
  { slug: 'network-10',   name: 'Network 10', homepageUrl: 'https://10play.com.au/' },
  { slug: 'tvnz-plus',    name: 'TVNZ+',      homepageUrl: 'https://www.tvnz.co.nz/' },
  { slug: 'sky-arena-nz', name: 'Sky Arena',  homepageUrl: 'https://www.sky.co.nz/sky-arena' },
  { slug: 'tva-sports',   name: 'TVA Sports', homepageUrl: 'https://www.tvasports.ca/' },
];

type Row = { region: string; section: Section; channelSlug: string; tier: Tier; note?: string | null };

const ROWS: Row[] = [
  // ---- USA ----
  { region: 'US', section: 'EARLY_PRELIMS', channelSlug: 'ufc-fight-pass',  tier: 'SUBSCRIPTION' },
  { region: 'US', section: 'PRELIMS',       channelSlug: 'cbs',             tier: 'FREE', note: 'Free over-the-air simulcast' },
  { region: 'US', section: 'PRELIMS',       channelSlug: 'paramount-plus',  tier: 'SUBSCRIPTION' },
  { region: 'US', section: 'MAIN_CARD',     channelSlug: 'paramount-plus',  tier: 'SUBSCRIPTION' },

  // ---- Canada — early prelims & prelims via Sportsnet+ subscription, main card is Sportsnet+ PPV (standalone, no sub required) ----
  { region: 'CA', section: 'EARLY_PRELIMS', channelSlug: 'ufc-fight-pass',  tier: 'SUBSCRIPTION' },
  { region: 'CA', section: 'PRELIMS',       channelSlug: 'sportsnet',       tier: 'SUBSCRIPTION' },
  { region: 'CA', section: 'PRELIMS',       channelSlug: 'tva-sports',      tier: 'SUBSCRIPTION', note: 'French language' },
  { region: 'CA', section: 'MAIN_CARD',     channelSlug: 'sportsnet',       tier: 'PPV', note: 'Standalone PPV — no Sportsnet+ subscription required' },

  // ---- UK ----
  { region: 'GB', section: 'EARLY_PRELIMS', channelSlug: 'ufc-fight-pass',  tier: 'SUBSCRIPTION' },
  { region: 'GB', section: 'PRELIMS',       channelSlug: 'tnt-sports',      tier: 'SUBSCRIPTION' },
  { region: 'GB', section: 'MAIN_CARD',     channelSlug: 'tnt-sports',      tier: 'SUBSCRIPTION' },

  // ---- Australia ----
  { region: 'AU', section: 'EARLY_PRELIMS', channelSlug: 'ufc-fight-pass',  tier: 'SUBSCRIPTION' },
  { region: 'AU', section: 'PRELIMS',       channelSlug: 'paramount-plus',  tier: 'SUBSCRIPTION' },
  { region: 'AU', section: 'PRELIMS',       channelSlug: 'network-10',      tier: 'FREE', note: 'Free-to-air' },
  { region: 'AU', section: 'MAIN_CARD',     channelSlug: 'main-event',      tier: 'PPV', note: 'On Kayo / Foxtel — standalone PPV' },

  // ---- New Zealand ----
  { region: 'NZ', section: 'EARLY_PRELIMS', channelSlug: 'ufc-fight-pass',  tier: 'SUBSCRIPTION' },
  { region: 'NZ', section: 'PRELIMS',       channelSlug: 'tvnz-plus',       tier: 'FREE' },
  { region: 'NZ', section: 'MAIN_CARD',     channelSlug: 'sky-arena-nz',    tier: 'PPV' },

  // ---- EU (DACH bucket — DAZN primary; other EU markets are coarser) ----
  { region: 'EU', section: 'EARLY_PRELIMS', channelSlug: 'ufc-fight-pass',  tier: 'SUBSCRIPTION' },
  { region: 'EU', section: 'PRELIMS',       channelSlug: 'ufc-fight-pass',  tier: 'SUBSCRIPTION' },
  { region: 'EU', section: 'MAIN_CARD',     channelSlug: 'dazn',            tier: 'SUBSCRIPTION', note: 'DACH — RMC Sport (FR), HBO Max (IT/ES)' },
];

(async () => {
  console.log('=== Adding missing channels ===');
  for (const c of NEW_CHANNELS) {
    const existing = await prisma.broadcastChannel.findUnique({ where: { slug: c.slug } });
    if (existing) {
      console.log(`  exists  ${c.slug}`);
    } else {
      await prisma.broadcastChannel.create({ data: c });
      console.log(`  created ${c.slug}`);
    }
  }

  // Resolve channel IDs
  const slugs = Array.from(new Set(ROWS.map(r => r.channelSlug)));
  const channels = await prisma.broadcastChannel.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const slugToId = new Map(channels.map(c => [c.slug, c.id]));

  // Wipe existing UFC 328 rows so reruns are clean (everything gets recreated below)
  const wiped = await prisma.eventBroadcast.deleteMany({ where: { eventId: EVENT_ID } });
  console.log(`\nWiped ${wiped.count} existing UFC 328 rows.\n`);

  console.log('=== Upserting UFC 328 broadcaster rows ===');
  for (const r of ROWS) {
    const channelId = slugToId.get(r.channelSlug);
    if (!channelId) {
      console.warn(`  SKIP ${r.region}/${r.section}/${r.channelSlug}: no such channel`);
      continue;
    }
    const created = await prisma.eventBroadcast.create({
      data: {
        eventId: EVENT_ID,
        channelId,
        region: r.region,
        cardSection: r.section,
        tier: r.tier,
        note: r.note ?? null,
        source: 'MANUAL',
      },
      select: { id: true },
    });
    console.log(`  ${r.region.padEnd(3)} ${r.section.padEnd(14)} ${r.channelSlug.padEnd(18)} ${r.tier.padEnd(13)} ${created.id}`);
  }

  console.log('\n=== Verify by region ===');
  for (const region of ['US', 'CA', 'GB', 'AU', 'NZ', 'EU']) {
    const rows = await prisma.eventBroadcast.findMany({
      where: { eventId: EVENT_ID, region },
      include: { channel: { select: { slug: true } } },
      orderBy: [{ cardSection: 'asc' }],
    });
    console.log(`\n${region}:`);
    rows.forEach(r => console.log(`  ${(r.cardSection ?? 'ALL').padEnd(14)} ${r.channel.slug.padEnd(18)} ${r.tier}${r.note ? '  // ' + r.note : ''}`));
  }

  await prisma.$disconnect();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
