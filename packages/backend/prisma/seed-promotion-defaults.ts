/**
 * Seed PromotionBroadcastDefault rows based on 2026 broadcaster research.
 * See docs/plans/how-to-watch-broadcaster-research-2026-05-03.md.
 *
 * Conventions:
 *  - Promotion strings must match Event.promotion exactly (UPPER, raw scrape values).
 *    We seed the most common variants; per-event rows override.
 *  - "EU" is a single bucket (DAZN dominates fight rights there).
 *  - When a promotion is per-card (MVP, Zuffa Boxing prelims), no default — admin enters per event.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Tier = 'FREE' | 'SUBSCRIPTION' | 'PPV';
type Region = 'US' | 'CA' | 'GB' | 'AU' | 'NZ' | 'EU';
type DefaultRow = { promotion: string; region: Region; channelSlug: string; tier: Tier; note?: string | null };

const defaults: DefaultRow[] = [
  // ---- UFC (Paramount era starts 2026) ----
  { promotion: 'UFC', region: 'US', channelSlug: 'paramount-plus', tier: 'SUBSCRIPTION' },
  { promotion: 'UFC', region: 'US', channelSlug: 'cbs',            tier: 'FREE', note: 'Select numbered events simulcast on CBS' },
  { promotion: 'UFC', region: 'GB', channelSlug: 'paramount-plus', tier: 'SUBSCRIPTION', note: 'Replaced TNT Sports starting 2026' },
  { promotion: 'UFC', region: 'AU', channelSlug: 'paramount-plus', tier: 'SUBSCRIPTION' },
  { promotion: 'UFC', region: 'CA', channelSlug: 'sportsnet',      tier: 'SUBSCRIPTION', note: 'Verify per card — Paramount has first-dibs but Sportsnet still active' },
  { promotion: 'UFC', region: 'NZ', channelSlug: 'sky-sport-nz',   tier: 'SUBSCRIPTION', note: 'No public Paramount NZ deal as of May 2026' },
  { promotion: 'UFC', region: 'EU', channelSlug: 'dazn',           tier: 'SUBSCRIPTION', note: 'DAZN primary in DE/AT/IT/ES/FR/PT/BE through 2027' },

  // ---- Zuffa Boxing (Paramount US/CA/LatAm/AU + Sky Sports UK from 2026) ----
  { promotion: 'Zuffa Boxing', region: 'US', channelSlug: 'paramount-plus', tier: 'SUBSCRIPTION' },
  { promotion: 'Zuffa Boxing', region: 'CA', channelSlug: 'paramount-plus', tier: 'SUBSCRIPTION' },
  { promotion: 'Zuffa Boxing', region: 'AU', channelSlug: 'paramount-plus', tier: 'SUBSCRIPTION' },
  { promotion: 'Zuffa Boxing', region: 'GB', channelSlug: 'sky-sports',     tier: 'SUBSCRIPTION', note: 'Multi-year Sky Sports deal (March 2026)' },

  // ---- ONE Championship (Prime Video US/CA + Sky Sports UK + ESPN AU/NZ) ----
  { promotion: 'ONE', region: 'US', channelSlug: 'prime-video', tier: 'SUBSCRIPTION' },
  { promotion: 'ONE', region: 'CA', channelSlug: 'prime-video', tier: 'SUBSCRIPTION' },
  { promotion: 'ONE', region: 'GB', channelSlug: 'sky-sports',  tier: 'SUBSCRIPTION', note: 'Sky Sports UK + Ireland (since Jan 2024)' },
  { promotion: 'ONE', region: 'AU', channelSlug: 'disney-plus', tier: 'SUBSCRIPTION', note: 'ESPN on Disney+ / Foxtel / Kayo / Fetch (Feb 2026)' },
  { promotion: 'ONE', region: 'NZ', channelSlug: 'sky-sport-nz', tier: 'SUBSCRIPTION', note: 'ESPN content via Sky Sport NZ (Feb 2026)' },

  // ---- PFL (ESPN+ US extended Feb 2026, DAZN ex-US, Stan Sport AU, Sky NZ) ----
  { promotion: 'PFL', region: 'US', channelSlug: 'espn-plus',    tier: 'SUBSCRIPTION', note: 'Multi-year ESPN extension Feb 2026' },
  { promotion: 'PFL', region: 'GB', channelSlug: 'dazn',         tier: 'SUBSCRIPTION' },
  { promotion: 'PFL', region: 'EU', channelSlug: 'dazn',         tier: 'SUBSCRIPTION' },
  { promotion: 'PFL', region: 'AU', channelSlug: 'stan-sport',   tier: 'SUBSCRIPTION', note: 'PFL on Stan Sport (Australia)' },
  { promotion: 'PFL', region: 'NZ', channelSlug: 'sky-sport-nz', tier: 'SUBSCRIPTION', note: 'New 2026 deal — all 16 PFL Global events' },
  { promotion: 'PFL', region: 'CA', channelSlug: 'dazn',         tier: 'SUBSCRIPTION' },

  // ---- BKFC (DAZN global) ----
  { promotion: 'BKFC', region: 'US', channelSlug: 'dazn', tier: 'SUBSCRIPTION' },
  { promotion: 'BKFC', region: 'CA', channelSlug: 'dazn', tier: 'SUBSCRIPTION' },
  { promotion: 'BKFC', region: 'GB', channelSlug: 'dazn', tier: 'SUBSCRIPTION' },
  { promotion: 'BKFC', region: 'AU', channelSlug: 'dazn', tier: 'SUBSCRIPTION' },
  { promotion: 'BKFC', region: 'NZ', channelSlug: 'dazn', tier: 'SUBSCRIPTION' },
  { promotion: 'BKFC', region: 'EU', channelSlug: 'dazn', tier: 'SUBSCRIPTION' },

  // ---- Matchroom Boxing (DAZN global + Foxtel AU) ----
  { promotion: 'Matchroom Boxing', region: 'US', channelSlug: 'dazn',   tier: 'SUBSCRIPTION' },
  { promotion: 'Matchroom Boxing', region: 'CA', channelSlug: 'dazn',   tier: 'SUBSCRIPTION' },
  { promotion: 'Matchroom Boxing', region: 'GB', channelSlug: 'dazn',   tier: 'SUBSCRIPTION' },
  { promotion: 'Matchroom Boxing', region: 'EU', channelSlug: 'dazn',   tier: 'SUBSCRIPTION' },
  { promotion: 'Matchroom Boxing', region: 'AU', channelSlug: 'foxtel', tier: 'SUBSCRIPTION', note: '2026 Foxtel deal — 8 shows' },
  { promotion: 'Matchroom Boxing', region: 'AU', channelSlug: 'dazn',   tier: 'SUBSCRIPTION' },
  { promotion: 'Matchroom Boxing', region: 'NZ', channelSlug: 'dazn',   tier: 'SUBSCRIPTION' },

  // ---- Golden Boy (DAZN exclusive) ----
  ...(['US','CA','GB','EU','AU','NZ'] as Region[]).map(region => ({
    promotion: 'Golden Boy', region, channelSlug: 'dazn', tier: 'SUBSCRIPTION' as Tier,
  })),

  // ---- Top Rank (DAZN as of 2026) ----
  ...(['US','CA','GB','EU','AU','NZ'] as Region[]).map(region => ({
    promotion: 'TOP_RANK', region, channelSlug: 'dazn', tier: 'SUBSCRIPTION' as Tier,
    note: 'Moved from ESPN to DAZN July 2025',
  })),

  // ---- Gold Star (DAZN globally — secondary boxing promoter on DAZN platform) ----
  ...(['US','CA','GB','EU','AU','NZ'] as Region[]).map(region => ({
    promotion: 'Gold Star', region, channelSlug: 'dazn', tier: 'SUBSCRIPTION' as Tier,
  })),

  // ---- Karate Combat (YouTube free worldwide) ----
  ...(['US','CA','GB','EU','AU','NZ'] as Region[]).map(region => ({
    promotion: 'Karate Combat', region, channelSlug: 'youtube', tier: 'FREE' as Tier,
  })),

  // ---- RAF (Fox Nation US — region-locked subscription) ----
  { promotion: 'RAF', region: 'US', channelSlug: 'fox-nation', tier: 'SUBSCRIPTION' },

  // ---- Dirty Boxing (YouTube free) ----
  ...(['US','CA','GB','EU','AU','NZ'] as Region[]).map(region => ({
    promotion: 'Dirty Boxing', region, channelSlug: 'youtube', tier: 'FREE' as Tier,
  })),

  // ---- Oktagon MMA (Oktagon.TV global + DAZN in select markets) ----
  ...(['US','CA','GB','EU','AU','NZ'] as Region[]).map(region => ({
    promotion: 'OKTAGON', region, channelSlug: 'oktagon-tv', tier: 'PPV' as Tier,
    note: 'PPV / subscription on Oktagon.TV',
  })),
  { promotion: 'OKTAGON', region: 'GB', channelSlug: 'dazn', tier: 'SUBSCRIPTION' },
  { promotion: 'OKTAGON', region: 'US', channelSlug: 'dazn', tier: 'SUBSCRIPTION' },

  // ---- RIZIN (FITE/Triller US/CA/UK/Europe, Rizin.tv global fallback) ----
  ...(['US','CA','GB','EU','AU','NZ'] as Region[]).map(region => ({
    promotion: 'RIZIN', region, channelSlug: 'fite-triller', tier: 'PPV' as Tier,
    note: 'FITE by Triller — official English-language PPV',
  })),

  // ---- Cage Warriors (UFC Fight Pass globally) ----
  ...(['US','CA','GB','EU','AU','NZ'] as Region[]).map(region => ({
    promotion: 'Cage Warriors', region, channelSlug: 'ufc-fight-pass', tier: 'SUBSCRIPTION' as Tier,
  })),

  // ---- Gamebred Bareknuckle MMA (free on YouTube globally) ----
  ...(['US','CA','GB','EU','AU','NZ'] as Region[]).map(region => ({
    promotion: 'Gamebred', region, channelSlug: 'youtube', tier: 'FREE' as Tier,
  })),

  // ---- MVP (per-card, no defaults) ----
  // Intentionally none — Netflix vs DAZN vs Sky Sports vary per card.
];

async function main() {
  console.log(`Seeding ${defaults.length} promotion broadcast defaults...`);
  let created = 0, updated = 0;
  for (const d of defaults) {
    const channel = await prisma.broadcastChannel.findUnique({
      where: { slug: d.channelSlug }, select: { id: true },
    });
    if (!channel) {
      console.warn(`  SKIP ${d.promotion}/${d.region}: missing channel "${d.channelSlug}"`);
      continue;
    }
    const existing = await prisma.promotionBroadcastDefault.findUnique({
      where: { promotion_region_channelId: { promotion: d.promotion, region: d.region, channelId: channel.id } },
    });
    if (existing) {
      await prisma.promotionBroadcastDefault.update({
        where: { id: existing.id },
        data: { tier: d.tier, note: d.note ?? null, isActive: true },
      });
      updated++;
    } else {
      await prisma.promotionBroadcastDefault.create({
        data: {
          promotion: d.promotion, region: d.region, channelId: channel.id,
          tier: d.tier, note: d.note ?? null,
        },
      });
      created++;
    }
  }
  console.log(`Done. Created: ${created}, updated: ${updated}.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
