/**
 * Canonicalize Event.promotion strings.
 *
 * Walks every Event row and rewrites `promotion` to the canonical value
 * defined in `promotionRegistry.ts`. Catches the legacy drift documented in
 * `docs/areas/scrapers.md`:
 *   - `TOP_RANK`(canonical) vs `Top Rank`
 *   - `Matchroom Boxing`(canonical) vs `Matchroom`
 *   - `RIZIN`(canonical) vs `Rizin`
 *
 * Any promotion string that isn't a known canonical or alias is reported but
 * not modified — those rows likely belong to legacy promotions (Bellator,
 * PBC, etc.) that were never migrated into the registry.
 *
 * Usage:
 *   pnpm tsx src/scripts/canonicalizePromotionStrings.ts            # dry run
 *   pnpm tsx src/scripts/canonicalizePromotionStrings.ts --apply    # write changes
 *
 * Idempotent — safe to re-run.
 */

import { PrismaClient } from '@prisma/client';
import {
  PROMOTION_REGISTRY,
  getPromotionByName,
  canonicalizePromotion,
} from '../config/promotionRegistry';

const prisma = new PrismaClient();

interface DriftRow {
  current: string;
  canonical: string;
  count: number;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  console.log(`\n[canonicalize] Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log('[canonicalize] Registry has', PROMOTION_REGISTRY.length, 'canonical promotions\n');

  // Group all events by their current promotion string and count.
  const groups = await prisma.event.groupBy({
    by: ['promotion'],
    _count: { _all: true },
  });

  const driftToCanonicalize: DriftRow[] = [];
  const alreadyCanonical: DriftRow[] = [];
  const unknown: DriftRow[] = [];

  for (const g of groups) {
    const current = g.promotion ?? '';
    const count = g._count._all;
    if (!current) continue;

    const entry = getPromotionByName(current);
    if (!entry) {
      unknown.push({ current, canonical: current, count });
      continue;
    }

    const canonical = entry.canonicalPromotion;
    if (current === canonical) {
      alreadyCanonical.push({ current, canonical, count });
    } else {
      driftToCanonicalize.push({ current, canonical, count });
    }
  }

  // ── Report ──
  console.log('━━ Already canonical ━━');
  for (const r of alreadyCanonical.sort((a, b) => b.count - a.count)) {
    console.log(`  ${r.canonical.padEnd(20)} ${r.count.toString().padStart(5)} rows`);
  }

  console.log('\n━━ Will be canonicalized ━━');
  if (driftToCanonicalize.length === 0) {
    console.log('  (none — all rows are canonical)');
  } else {
    for (const r of driftToCanonicalize.sort((a, b) => b.count - a.count)) {
      console.log(`  ${r.current.padEnd(25)} → ${r.canonical.padEnd(20)} ${r.count.toString().padStart(5)} rows`);
    }
  }

  console.log('\n━━ Unknown (not in registry, left alone) ━━');
  if (unknown.length === 0) {
    console.log('  (none)');
  } else {
    for (const r of unknown.sort((a, b) => b.count - a.count)) {
      console.log(`  ${r.current.padEnd(25)} ${r.count.toString().padStart(5)} rows`);
    }
  }

  // ── Apply ──
  if (driftToCanonicalize.length === 0) {
    console.log('\n[canonicalize] Nothing to do.');
    return;
  }

  if (!apply) {
    console.log('\n[canonicalize] Dry run — no changes written. Re-run with --apply to commit.');
    return;
  }

  console.log('\n[canonicalize] Applying...');
  let totalUpdated = 0;
  for (const r of driftToCanonicalize) {
    const result = await prisma.event.updateMany({
      where: { promotion: r.current },
      data: { promotion: r.canonical },
    });
    console.log(`  ${r.current} → ${r.canonical}: updated ${result.count} rows`);
    totalUpdated += result.count;
  }
  console.log(`\n[canonicalize] Done. Updated ${totalUpdated} rows total.`);

  // Sanity check: verify canonicalize() is idempotent on the registry's canonicals.
  for (const e of PROMOTION_REGISTRY) {
    const recanonicalized = canonicalizePromotion(e.canonicalPromotion);
    if (recanonicalized !== e.canonicalPromotion) {
      console.error(`[canonicalize] !! NON-IDEMPOTENT: ${e.canonicalPromotion} → ${recanonicalized}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('[canonicalize] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
