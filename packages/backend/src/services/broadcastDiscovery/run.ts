/**
 * Orchestrator for the weekly broadcast-discovery job.
 *
 * Run via:
 *   - GitHub Actions cron (`broadcast-discovery.yml`)
 *   - Manual admin trigger (POST /api/admin/broadcast-discoveries/run)
 *   - CLI: pnpm tsx src/services/broadcastDiscovery/run.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { braveSearch } from './searchBrave';
import { fetchHowToWatch } from './fetchHowToWatch';
import { extractFindings } from './extract';
import { classifyFindings } from './diff';
import { persistFindings } from './persist';

const REGIONS = ['US', 'CA', 'GB', 'AU', 'NZ', 'EU'] as const;
type Region = typeof REGIONS[number];

const REGION_QUERY_HINT: Record<Region, string> = {
  US:  'United States',
  CA:  'Canada',
  GB:  'United Kingdom',
  AU:  'Australia',
  NZ:  'New Zealand',
  EU:  'Europe Germany France Italy Spain',
};

interface RunOptions {
  /** Limit to specific promotions. Empty = all active. */
  promotions?: string[];
  /** Limit to specific regions. Empty = all 6. */
  regions?: Region[];
  /** Skip a region for a promotion if it has a default verified within this many days. */
  skipFreshDays?: number;
  /** Cap total Brave queries per run (rate-limit safety). */
  maxQueries?: number;
}

export interface RunSummary {
  runId: string;
  startedAt: Date;
  finishedAt: Date;
  promotionsScanned: number;
  queriesUsed: number;
  llmCalls: number;
  inserted: number;
  bumpedConfirmed: number;
  suppressed: number;
  errors: { promotion: string; region: string; error: string }[];
}

export async function runDiscovery(
  prisma: PrismaClient,
  opts: RunOptions = {},
): Promise<RunSummary> {
  const runId = randomUUID();
  const startedAt = new Date();
  const summary: RunSummary = {
    runId,
    startedAt,
    finishedAt: startedAt,
    promotionsScanned: 0,
    queriesUsed: 0,
    llmCalls: 0,
    inserted: 0,
    bumpedConfirmed: 0,
    suppressed: 0,
    errors: [],
  };

  const skipFreshMs = (opts.skipFreshDays ?? 14) * 24 * 60 * 60 * 1000;
  const maxQueries = opts.maxQueries ?? 200;
  const targetRegions = opts.regions ?? REGIONS;

  // Active promotions = those with upcoming events.
  const promoRows = await prisma.event.groupBy({
    by: ['promotion'],
    where: { date: { gte: new Date() } },
    _count: { _all: true },
  });
  let promotions = promoRows.map(r => r.promotion);
  if (opts.promotions && opts.promotions.length > 0) {
    const filter = new Set(opts.promotions);
    promotions = promotions.filter(p => filter.has(p));
  }

  console.log(`[discovery] runId=${runId} scanning ${promotions.length} promotion(s) × ${targetRegions.length} region(s)`);

  for (const promotion of promotions) {
    summary.promotionsScanned++;

    let howToWatchPage: { url: string; text: string } | undefined;
    try {
      const fetched = await fetchHowToWatch(promotion);
      if (fetched) howToWatchPage = { url: fetched.url, text: fetched.text };
    } catch (e: any) {
      console.warn(`[discovery] ${promotion} how-to-watch fetch error:`, e?.message);
    }

    for (const region of targetRegions) {
      if (summary.queriesUsed >= maxQueries) {
        console.warn(`[discovery] hit maxQueries=${maxQueries}, stopping`);
        break;
      }

      try {
        // Skip if the existing default is fresh.
        const existing = await prisma.promotionBroadcastDefault.findFirst({
          where: { promotion, region, isActive: true, lastDiscoveryAt: { gte: new Date(Date.now() - skipFreshMs) } },
        });
        if (existing) continue;

        // 1. Search.
        const queries = [
          `${promotion} broadcaster ${REGION_QUERY_HINT[region]} 2026`,
          `where to watch ${promotion} ${region} 2026`,
        ];
        const seen = new Set<string>();
        const snippets: { url: string; title: string; description: string }[] = [];
        for (const q of queries) {
          if (summary.queriesUsed >= maxQueries) break;
          const results = await braveSearch(q, 5);
          summary.queriesUsed++;
          for (const r of results) {
            if (!r.url || seen.has(r.url)) continue;
            seen.add(r.url);
            snippets.push({ url: r.url, title: r.title, description: r.description });
          }
        }

        if (snippets.length === 0 && !howToWatchPage) continue;

        // 2. Look up current defaults to inform the LLM.
        const currentDefaults = await prisma.promotionBroadcastDefault.findMany({
          where: { promotion, region, isActive: true },
          include: { channel: { select: { name: true } } },
        });

        // 3. Extract via Claude.
        const findings = await extractFindings({
          promotion,
          region,
          currentDefaults: currentDefaults.map(d => ({ channelName: d.channel.name, tier: d.tier })),
          snippets: snippets.slice(0, 8),
          howToWatchPage,
        });
        summary.llmCalls++;

        // 4. Classify (NEW/CONFIRMED/CHANGED, resolve channel slugs).
        const classified = await classifyFindings(prisma, promotion, region, findings);

        // 5. Persist.
        const result = await persistFindings(prisma, runId, promotion, region, classified);
        summary.inserted += result.inserted;
        summary.bumpedConfirmed += result.bumpedConfirmed;
        summary.suppressed += result.suppressed;
      } catch (e: any) {
        console.error(`[discovery] ${promotion}/${region} error:`, e?.message);
        summary.errors.push({ promotion, region, error: String(e?.message ?? e) });
      }
    }

    if (summary.queriesUsed >= maxQueries) break;
  }

  summary.finishedAt = new Date();
  console.log(
    `[discovery] runId=${runId} done in ${Math.round((summary.finishedAt.getTime() - startedAt.getTime()) / 1000)}s — ` +
    `inserted=${summary.inserted}, confirmed=${summary.bumpedConfirmed}, suppressed=${summary.suppressed}, errors=${summary.errors.length}`,
  );
  return summary;
}

/** CLI entry. Usage: `pnpm tsx src/services/broadcastDiscovery/run.ts` */
if (require.main === module) {
  const prisma = new PrismaClient();
  runDiscovery(prisma)
    .then(summary => {
      console.log(JSON.stringify(summary, null, 2));
      process.exit(summary.errors.length > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('[discovery] fatal:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
