/**
 * UFC Fighter Headshot Backfill
 *
 * Finds Fighter rows missing `profileImage` who have appeared in UFC events,
 * fetches their canonical headshot from ufc.com/athlete/<slug>, and uploads
 * to Cloudflare R2 via the existing imageStorage service.
 *
 * Slug source priority:
 *   1. Existing Fighter.ufcAthleteSlug (set by backfillFighterSlug.ts)
 *   2. Derived from name (firstName-lastName, lowercased, hyphenated)
 *   When both fail, the fighter is logged as `no-page` and skipped.
 *
 * Tapology fallback is NOT implemented in v1 — see followup memory notes.
 * Most active and recently-retired UFC fighters will resolve via ufc.com;
 * deeply retired pre-2010 fighters who lack a current ufc.com page are the
 * residual gap.
 *
 * Safety contract:
 *   - Null-only writes. Never overwrites an existing profileImage.
 *   - R2 dedup: imageStorage.uploadFighterImage hashes the source URL,
 *     so re-running with the same source URL is idempotent.
 *
 * Environment:
 *   DATABASE_URL                 Required.
 *   R2_*                         Required for actual R2 uploads (else fallback).
 *   BACKFILL_HEADSHOT_LIMIT      Cap on number of fighters to process (testing).
 *   BACKFILL_HEADSHOT_RATE_MS    Sleep between fighter fetches (default 750).
 *   BACKFILL_HEADSHOT_DRY_RUN    "true" = log writes but don't execute.
 *
 * Run:
 *   pnpm tsx src/scripts/backfillUFCHeadshots.ts
 *   BACKFILL_HEADSHOT_LIMIT=10 BACKFILL_HEADSHOT_DRY_RUN=true pnpm tsx ...
 */

import { PrismaClient } from '@prisma/client';
import {
  fetchUFCAthleteHeadshot,
  deriveUFCAthleteSlug,
  launchAthleteBrowser,
  closeAthleteBrowser,
  searchUFCAthleteSlugViaDDG,
  AthleteBrowserHandle,
} from '../services/scrapeUFCAthleteHeadshot';
import { uploadFighterImage, uploadImageToR2 } from '../services/imageStorage';

const prisma = new PrismaClient();

const RATE_LIMIT_MS = parseInt(process.env.BACKFILL_HEADSHOT_RATE_MS || '750', 10);
const DRY_RUN = process.env.BACKFILL_HEADSHOT_DRY_RUN === 'true';
const LIMIT = process.env.BACKFILL_HEADSHOT_LIMIT
  ? parseInt(process.env.BACKFILL_HEADSHOT_LIMIT, 10)
  : null;

interface RunStats {
  considered: number;
  okFromExistingSlug: number;
  okFromDerivedSlug: number;
  okFromSearch: number;
  placeholderUsed: number;
  noPage: number;
  noImage: number;
  errors: number;
  uploaded: number;
  skipped: number;
}

// Stored URL pattern for SILHOUETTE placeholders. The R2 key uses prefix
// "placeholder" so the predicate can identify these rows on the next run
// and re-attempt to find a real headshot.
const PLACEHOLDER_R2_PREFIX = 'placeholder';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function findCandidates() {
  // Fighters who appeared in any UFC event (eventStatus doesn't matter)
  // AND have a missing/broken profileImage. "Broken" today means the
  // legacy fightingtomatoes.com host that stopped serving images after the
  // 2026-04-17 migration off GoDaddy — every such URL now 404s.
  //
  // Ordering: rating-weighted impact — fighters in the most-engaged UFC
  // fights surface first, so stars (McGregor duplicates, Khabib, Glover
  // Teixeira, Robbie Lawler, Rory MacDonald, etc.) get fixed in the
  // earliest batch.
  return prisma.$queryRaw<Array<{ id: string; firstName: string; lastName: string; ufcAthleteSlug: string | null }>>`
    SELECT f.id, f."firstName", f."lastName", f."ufcAthleteSlug"
    FROM fighters f
    JOIN fights fi ON (fi."fighter1Id" = f.id OR fi."fighter2Id" = f.id)
    JOIN events e ON e.id = fi."eventId"
    WHERE (
            f."profileImage" IS NULL
            OR f."profileImage" LIKE 'https://fightingtomatoes.com/%'
            OR f."profileImage" LIKE 'http://fightingtomatoes.com/%'
            -- An earlier run with R2 misconfigured wrote raw ufc.com URLs;
            -- re-process them so the image ends up in R2 (owned), not
            -- hot-linked. Once R2 hosts them, this branch becomes a no-op
            -- (no rows match) and is harmless.
            OR f."profileImage" LIKE 'https://ufc.com/%'
            OR f."profileImage" LIKE 'https://www.ufc.com/%'
            -- An interim run with R2_PUBLIC_URL unset wrote URLs of the
            -- form <bucket>.r2.dev which 500. Heal those too.
            OR f."profileImage" LIKE 'https://fightcrewapp-images.r2.dev/%'
            -- Placeholder silhouettes from a previous run; re-attempt to
            -- find a real headshot via the DDG search fallback.
            OR f."profileImage" LIKE '%/fighters/placeholder-%'
            -- Raw UFC SILHOUETTE URL written by older runs that missed the
            -- placeholder branch entirely.
            OR f."profileImage" ILIKE '%SILHOUETTE.png%'
          )
      AND (
            e."scraperType" = 'ufc'
            OR e.name ~* '^UFC[: ]'
            OR e.name ~* '^UFC$'
          )
    GROUP BY f.id, f."firstName", f."lastName", f."ufcAthleteSlug"
    ORDER BY COALESCE(SUM(fi."totalRatings"),0) DESC, AVG(NULLIF(fi."averageRating",0)) DESC NULLS LAST
  `;
}

async function processFighter(
  fighter: { id: string; firstName: string; lastName: string; ufcAthleteSlug: string | null },
  stats: RunStats,
  handle: AthleteBrowserHandle,
): Promise<void> {
  stats.considered++;
  const fullName = `${fighter.firstName} ${fighter.lastName}`.trim();

  // Slug priority: existing column → derived from name
  const slugCandidates: string[] = [];
  if (fighter.ufcAthleteSlug) slugCandidates.push(fighter.ufcAthleteSlug);
  const derived = deriveUFCAthleteSlug(fullName);
  if (derived && !slugCandidates.includes(derived)) slugCandidates.push(derived);

  if (slugCandidates.length === 0) {
    stats.noPage++;
    return;
  }

  let imageUrl: string | undefined;
  let usedSlug: string | undefined;
  let isPlaceholder = false;
  let resolvedVia: 'existing' | 'derived' | 'search' | undefined;
  let lastResult: 'no-page' | 'no-image' | 'error' = 'no-page';
  let lastError: string | undefined;

  for (const slug of slugCandidates) {
    const r = await fetchUFCAthleteHeadshot(slug, handle);
    if (r.status === 'ok' && r.imageUrl) {
      imageUrl = r.imageUrl;
      usedSlug = slug;
      isPlaceholder = !!r.isPlaceholder;
      resolvedVia = slug === fighter.ufcAthleteSlug ? 'existing' : 'derived';
      break;
    }
    lastResult = r.status === 'ok' ? 'no-image' : r.status;
    lastError = r.errorMessage;
    // small interleave delay to be polite
    await sleep(150);
  }

  // Search fallback: every derived/existing slug missed. Either the page
  // 404'd (slug we computed never existed on UFC.com — common for nicknames
  // stored as legal name) or the page rendered with no og:image (slug typo
  // / disambiguation suffix we didn't know about). Ask DDG for the canonical
  // slug and try one more time.
  if (!imageUrl && (lastResult === 'no-image' || lastResult === 'no-page')) {
    const searchSlug = await searchUFCAthleteSlugViaDDG(fullName);
    if (searchSlug && !slugCandidates.includes(searchSlug)) {
      const r = await fetchUFCAthleteHeadshot(searchSlug, handle);
      if (r.status === 'ok' && r.imageUrl) {
        imageUrl = r.imageUrl;
        usedSlug = searchSlug;
        isPlaceholder = !!r.isPlaceholder;
        resolvedVia = 'search';
      } else {
        lastResult = r.status === 'ok' ? 'no-image' : r.status;
        lastError = r.errorMessage;
      }
    }
  }

  if (!imageUrl || !usedSlug) {
    if (lastResult === 'error') {
      stats.errors++;
      console.log(`  [error]   ${fullName}  (slugs tried: ${slugCandidates.join(', ')})  ${lastError || ''}`);
    } else if (lastResult === 'no-image') {
      stats.noImage++;
      console.log(`  [no-img]  ${fullName}  (slug: ${slugCandidates[slugCandidates.length - 1]})`);
    } else {
      stats.noPage++;
      console.log(`  [no-page] ${fullName}  (slugs tried: ${slugCandidates.join(', ')})`);
    }
    return;
  }

  if (resolvedVia === 'existing') stats.okFromExistingSlug++;
  else if (resolvedVia === 'search') stats.okFromSearch++;
  else stats.okFromDerivedSlug++;

  if (DRY_RUN) {
    console.log(`  [dry-run] ${fullName}  slug=${usedSlug}  → ${imageUrl}`);
    stats.uploaded++;
    return;
  }

  // Upload to R2; if R2 not configured, the helper falls back to the source URL.
  // Placeholders go through a known "placeholder" prefix so the predicate can
  // re-attempt them on future runs (e.g. after UFC adds a real headshot).
  // Since the silhouette URL is identical across fighters, all placeholders
  // dedupe to one shared R2 object.
  let r2Url: string;
  try {
    if (isPlaceholder) {
      r2Url = await uploadImageToR2(imageUrl, 'fighters', PLACEHOLDER_R2_PREFIX);
      stats.placeholderUsed++;
    } else {
      r2Url = await uploadFighterImage(imageUrl, fullName);
    }
  } catch (err: any) {
    console.log(`  [upload-err] ${fullName}: ${err.message}`);
    stats.errors++;
    return;
  }

  // Persist to DB. updateMany lets us re-check that the row STILL matches the
  // backfill predicate (null OR dead legacy URL) at write time, so a concurrent
  // run or human edit that just set a real R2 image won't get overwritten.
  const updateData: { profileImage: string; ufcAthleteSlug?: string } = { profileImage: r2Url };
  if (!fighter.ufcAthleteSlug && usedSlug) {
    updateData.ufcAthleteSlug = usedSlug;
  }
  const whereClause = {
    id: fighter.id,
    OR: [
      { profileImage: null },
      { profileImage: { startsWith: 'https://fightingtomatoes.com/' } },
      { profileImage: { startsWith: 'http://fightingtomatoes.com/' } },
      { profileImage: { startsWith: 'https://ufc.com/' } },
      { profileImage: { startsWith: 'https://www.ufc.com/' } },
      { profileImage: { startsWith: 'https://fightcrewapp-images.r2.dev/' } },
      // Placeholder silhouettes — overwriteable so a later run with a real
      // photo replaces the silhouette.
      { profileImage: { contains: '/fighters/placeholder-' } },
      { profileImage: { contains: 'SILHOUETTE.png' } },
    ],
  };
  try {
    let result = await prisma.fighter.updateMany({ where: whereClause, data: updateData });
    if (result.count === 0 && updateData.ufcAthleteSlug) {
      stats.skipped++;
      return;
    }
    if (result.count > 0) {
      stats.uploaded++;
      const tag = isPlaceholder
        ? '[ok-placeholder]'
        : resolvedVia === 'search' ? '[ok-search]' : '[ok]';
      console.log(`  ${tag} ${fullName}  slug=${usedSlug}`);
      return;
    }
    // updateMany returned 0 but we had no slug to drop — true skip.
    stats.skipped++;
  } catch (err: any) {
    // P2002: unique-constraint failure on ufcAthleteSlug — another fighter
    // already owns the derived slug (the duplicate-fighter problem). Retry
    // without writing the slug; the image is what we actually need.
    if (err.code === 'P2002' && updateData.ufcAthleteSlug) {
      try {
        const { ufcAthleteSlug: _drop, ...imageOnly } = updateData;
        const result = await prisma.fighter.updateMany({ where: whereClause, data: imageOnly });
        if (result.count > 0) {
          stats.uploaded++;
          console.log(`  [ok-noslug] ${fullName}  (slug ${usedSlug} taken by duplicate)`);
          return;
        }
        stats.skipped++;
      } catch (err2: any) {
        console.log(`  [db-err]  ${fullName}: ${err2.message}`);
        stats.errors++;
      }
      return;
    }
    console.log(`  [db-err]  ${fullName}: ${err.message}`);
    stats.errors++;
  }
}

async function main() {
  console.log('========================================');
  console.log('[ufc-headshots] Backfill from ufc.com/athlete/<slug>');
  console.log(`[ufc-headshots] Rate limit: ${RATE_LIMIT_MS}ms`);
  console.log(`[ufc-headshots] Limit: ${LIMIT ?? 'none'}`);
  console.log(`[ufc-headshots] Dry run: ${DRY_RUN}`);
  console.log(`[ufc-headshots] Started: ${new Date().toISOString()}`);
  console.log('========================================');

  const candidates = await findCandidates();
  console.log(`\n[ufc-headshots] Candidates: ${candidates.length} fighters with no profileImage`);

  const subset = LIMIT ? candidates.slice(0, LIMIT) : candidates;
  if (LIMIT) console.log(`[ufc-headshots] After limit: ${subset.length}`);

  const stats: RunStats = {
    considered: 0, okFromExistingSlug: 0, okFromDerivedSlug: 0, okFromSearch: 0,
    placeholderUsed: 0, noPage: 0, noImage: 0, errors: 0, uploaded: 0, skipped: 0,
  };

  // Parallel worker pool. Page-per-fetch (in scrapeUFCAthleteHeadshot) is
  // safe to share across concurrent workers using one browser; the prior
  // protocol-buildup bug was scoped to a reused Page, not a reused Browser.
  // Concurrency = 3 keeps the request rate against UFC.com modest (each
  // worker is mostly blocked on its own page.goto) while cutting wall-clock
  // time ~3x vs the old serial loop. Per-worker inter-fighter sleep is
  // dropped since the natural page.goto latency provides throttling.
  const CONCURRENCY = parseInt(process.env.BACKFILL_HEADSHOT_CONCURRENCY || '3', 10);
  console.log('\n[ufc-headshots] Launching headless Chrome…');
  const handle = await launchAthleteBrowser();
  let cursor = 0;
  const claimNext = (): number | null => {
    if (cursor >= subset.length) return null;
    return cursor++;
  };
  console.log(`[ufc-headshots] Worker concurrency: ${CONCURRENCY}`);
  try {
    const workers = Array.from({ length: CONCURRENCY }, (_, workerId) => (async () => {
      for (;;) {
        const i = claimNext();
        if (i === null) return;
        const fighter = subset[i];
        if (i % 25 === 0) {
          console.log(`\n[ufc-headshots] Progress: ~${i}/${subset.length}`);
        }
        try {
          await processFighter(fighter, stats, handle);
        } catch (err: any) {
          console.log(`  [worker${workerId}-err] ${fighter.firstName} ${fighter.lastName}: ${err.message}`);
          stats.errors++;
        }
      }
    })());
    await Promise.all(workers);
  } finally {
    await closeAthleteBrowser(handle).catch(() => {});
  }

  console.log('\n========================================');
  console.log('[ufc-headshots] Summary');
  console.log(`  considered: ${stats.considered}`);
  console.log(`  uploaded:   ${stats.uploaded}`);
  console.log(`    via existing slug: ${stats.okFromExistingSlug}`);
  console.log(`    via derived slug:  ${stats.okFromDerivedSlug}`);
  console.log(`    via DDG search:    ${stats.okFromSearch}`);
  console.log(`    placeholder used:  ${stats.placeholderUsed}`);
  console.log(`  skipped (already set): ${stats.skipped}`);
  console.log(`  no ufc.com page: ${stats.noPage}`);
  console.log(`  page exists, no image: ${stats.noImage}`);
  console.log(`  errors: ${stats.errors}`);
  console.log(`[ufc-headshots] Done at ${new Date().toISOString()}`);
  console.log('========================================');

  // Only fail the workflow if errors are systemic, not transient. A handful
  // of HTTP 403s on UFC's CDN during a 600+ fighter run is normal noise.
  const errorRate = stats.considered > 0 ? stats.errors / stats.considered : 0;
  if (errorRate > 0.05) {
    console.log(`[ufc-headshots] Error rate ${(errorRate * 100).toFixed(1)}% exceeds 5% — marking workflow failed.`);
    process.exitCode = 1;
  }
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(process.exitCode || 0)))
  .catch(async (err) => {
    console.error('[ufc-headshots] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
