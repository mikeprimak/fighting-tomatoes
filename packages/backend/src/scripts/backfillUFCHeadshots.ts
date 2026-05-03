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
} from '../services/scrapeUFCAthleteHeadshot';
import { uploadFighterImage } from '../services/imageStorage';

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
  noPage: number;
  noImage: number;
  errors: number;
  uploaded: number;
  skipped: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function findCandidates() {
  // Fighters who: (a) have no profileImage AND (b) have appeared in any
  // UFC event (eventStatus doesn't matter — even unfinished bookings count
  // because the fighter exists and has a UFC slug worth checking).
  return prisma.$queryRaw<Array<{ id: string; firstName: string; lastName: string; ufcAthleteSlug: string | null }>>`
    SELECT DISTINCT f.id, f."firstName", f."lastName", f."ufcAthleteSlug"
    FROM fighters f
    WHERE f."profileImage" IS NULL
      AND EXISTS (
        SELECT 1
        FROM fights fi
        JOIN events e ON e.id = fi."eventId"
        WHERE (fi."fighter1Id" = f.id OR fi."fighter2Id" = f.id)
          AND (
            e."scraperType" = 'ufc'
            OR e.name ~* '^UFC[: ]'
            OR e.name ~* '^UFC$'
          )
      )
    ORDER BY f."lastName", f."firstName"
  `;
}

async function processFighter(
  fighter: { id: string; firstName: string; lastName: string; ufcAthleteSlug: string | null },
  stats: RunStats,
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
  let lastResult: 'no-page' | 'no-image' | 'error' = 'no-page';
  let lastError: string | undefined;

  for (const slug of slugCandidates) {
    const r = await fetchUFCAthleteHeadshot(slug);
    if (r.status === 'ok' && r.imageUrl) {
      imageUrl = r.imageUrl;
      usedSlug = slug;
      break;
    }
    lastResult = r.status === 'ok' ? 'no-image' : r.status;
    lastError = r.errorMessage;
    // small interleave delay to be polite
    await sleep(150);
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

  if (fighter.ufcAthleteSlug) stats.okFromExistingSlug++;
  else stats.okFromDerivedSlug++;

  if (DRY_RUN) {
    console.log(`  [dry-run] ${fullName}  slug=${usedSlug}  → ${imageUrl}`);
    stats.uploaded++;
    return;
  }

  // Upload to R2; if R2 not configured, the helper falls back to the source URL
  let r2Url: string;
  try {
    r2Url = await uploadFighterImage(imageUrl, fullName);
  } catch (err: any) {
    console.log(`  [upload-err] ${fullName}: ${err.message}`);
    stats.errors++;
    return;
  }

  // Persist to DB
  const updateData: { profileImage: string; ufcAthleteSlug?: string } = { profileImage: r2Url };
  // If we had to derive the slug and it worked, write it back so future runs
  // skip the derivation step
  if (!fighter.ufcAthleteSlug && usedSlug) {
    updateData.ufcAthleteSlug = usedSlug;
  }
  try {
    await prisma.fighter.update({
      where: { id: fighter.id, profileImage: null }, // re-check null at write time
      data: updateData,
    });
    stats.uploaded++;
    console.log(`  [ok]      ${fullName}  slug=${usedSlug}`);
  } catch (err: any) {
    if (err.code === 'P2025') {
      // Row no longer matches the WHERE (profileImage was set by another run)
      stats.skipped++;
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
    considered: 0, okFromExistingSlug: 0, okFromDerivedSlug: 0,
    noPage: 0, noImage: 0, errors: 0, uploaded: 0, skipped: 0,
  };

  for (let i = 0; i < subset.length; i++) {
    const fighter = subset[i];
    if (i % 25 === 0) {
      console.log(`\n[ufc-headshots] Progress: ${i}/${subset.length}`);
    }
    await processFighter(fighter, stats);
    if (i < subset.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log('\n========================================');
  console.log('[ufc-headshots] Summary');
  console.log(`  considered: ${stats.considered}`);
  console.log(`  uploaded:   ${stats.uploaded}`);
  console.log(`    via existing slug: ${stats.okFromExistingSlug}`);
  console.log(`    via derived slug:  ${stats.okFromDerivedSlug}`);
  console.log(`  skipped (already set): ${stats.skipped}`);
  console.log(`  no ufc.com page: ${stats.noPage}`);
  console.log(`  page exists, no image: ${stats.noImage}`);
  console.log(`  errors: ${stats.errors}`);
  console.log(`[ufc-headshots] Done at ${new Date().toISOString()}`);
  console.log('========================================');

  if (stats.errors > 0) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(process.exitCode || 0)))
  .catch(async (err) => {
    console.error('[ufc-headshots] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
