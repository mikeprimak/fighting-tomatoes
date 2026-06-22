/**
 * UFC Recent-Fighter Headshot Refresh
 *
 * Re-pulls headshots from ufc.com for fighters who appeared on a UFC card that
 * COMPLETED within the last N days, and OVERWRITES the stored image when the
 * source photo has changed.
 *
 * Why this exists (separate from backfillUFCHeadshots.ts):
 *   The backfill is *null-only* — it never touches a fighter who already has a
 *   profileImage. But UFC.com re-shoots/re-renders headshots when a fighter's
 *   status changes (most visibly: gaining or losing a belt). After UFC Freedom
 *   250 the app kept showing the old champ portraits for Pereira/Topuria while
 *   ufc.com had already swapped in the new ones. Nothing re-pulled them because
 *   they already had an image. This job closes that gap by re-checking everyone
 *   who *just fought* — the exact population whose photo is most likely to have
 *   been updated — on a short cadence.
 *
 * How change is detected (cheaply, no content hashing):
 *   imageStorage keys each R2 object on md5(sourceUrl). When UFC publishes a new
 *   portrait it lives at a new asset path, so uploadFighterImage() produces a
 *   NEW R2 url. We compare that url to the one already in the DB and only write
 *   when it differs. If the source url is unchanged, uploadFighterImage()
 *   short-circuits on the existing R2 object (HeadObject) and returns the same
 *   url → we skip. So re-running daily over the same window is cheap: one page
 *   fetch per fighter, an R2 download only when the photo actually changed.
 *   (Limitation: if UFC ever swaps bytes *behind the same url* this won't catch
 *   it — but belt-change re-renders use new asset paths in practice.)
 *
 * Safety contract:
 *   - Requires R2 to be configured. Without it uploadFighterImage() falls back
 *     to returning the raw ufc.com url, which would DOWNGRADE a hosted R2 image
 *     to a hot-linked one — so we abort instead.
 *   - Never replaces a real photo with a silhouette/placeholder (skip if
 *     isPlaceholder). A worse image is never an upgrade.
 *   - Trust-check (og:title vs fighter name) before accepting, same as backfill —
 *     UFC.com redirects unknown slugs to generic pages with someone else's photo.
 *   - Optimistic-concurrency write: updateMany WHERE the row still holds the
 *     value we read, so a concurrent backfill/admin edit isn't clobbered.
 *
 * Environment:
 *   DATABASE_URL                 Required.
 *   R2_*                         Required (job aborts if unconfigured).
 *   BRAVE_API_KEY                Optional slug-search fallback.
 *   REFRESH_HEADSHOT_WINDOW_DAYS Look-back window in days (default 10).
 *   REFRESH_HEADSHOT_RATE_MS     Sleep between fighter fetches (default 750).
 *   REFRESH_HEADSHOT_LIMIT       Cap fighters processed (testing).
 *   REFRESH_HEADSHOT_DRY_RUN     "true" = log intended writes, don't execute.
 *
 * Run:
 *   pnpm tsx src/scripts/refreshRecentUFCHeadshots.ts
 *   REFRESH_HEADSHOT_DRY_RUN=true REFRESH_HEADSHOT_WINDOW_DAYS=30 pnpm tsx ...
 */

import { PrismaClient } from '@prisma/client';
import {
  fetchUFCAthleteHeadshot,
  deriveUFCAthleteSlug,
  launchAthleteBrowser,
  closeAthleteBrowser,
  searchUFCAthleteSlugViaBrave,
  isHeadshotTrustworthy,
  AthleteBrowserHandle,
} from '../services/scrapeUFCAthleteHeadshot';
import { uploadFighterImage, getR2Status } from '../services/imageStorage';

const prisma = new PrismaClient();

const WINDOW_DAYS = parseInt(process.env.REFRESH_HEADSHOT_WINDOW_DAYS || '10', 10);
const RATE_LIMIT_MS = parseInt(process.env.REFRESH_HEADSHOT_RATE_MS || '750', 10);
const DRY_RUN = process.env.REFRESH_HEADSHOT_DRY_RUN === 'true';
const LIMIT = process.env.REFRESH_HEADSHOT_LIMIT
  ? parseInt(process.env.REFRESH_HEADSHOT_LIMIT, 10)
  : null;

interface RunStats {
  considered: number;
  updated: number;
  unchanged: number;
  placeholderSkipped: number;
  rejected: number;
  noPage: number;
  noImage: number;
  errors: number;
  skippedConcurrent: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  ufcAthleteSlug: string | null;
  profileImage: string | null;
}

/**
 * Fighters who appeared on a UFC card that COMPLETED in the last WINDOW_DAYS.
 * scraperType='ufc' keeps us to events whose headshots actually live on
 * ufc.com (the only source this job knows how to fetch). Recency is keyed on
 * mainStartTime (the real event instant), falling back to the date placeholder
 * for older rows that predate mainStartTime population.
 */
async function findCandidates(): Promise<Candidate[]> {
  return prisma.$queryRaw<Candidate[]>`
    SELECT DISTINCT f.id, f."firstName", f."lastName", f."ufcAthleteSlug", f."profileImage"
    FROM fighters f
    JOIN fights fi ON (fi."fighter1Id" = f.id OR fi."fighter2Id" = f.id)
    JOIN events e ON e.id = fi."eventId"
    WHERE e."eventStatus" = 'COMPLETED'
      AND e."scraperType" = 'ufc'
      AND COALESCE(e."mainStartTime", e."date") >= NOW() - (${WINDOW_DAYS} * INTERVAL '1 day')
      AND COALESCE(e."mainStartTime", e."date") <= NOW()
  `;
}

async function processFighter(
  fighter: Candidate,
  stats: RunStats,
  handle: AthleteBrowserHandle,
): Promise<void> {
  stats.considered++;
  const fullName = `${fighter.firstName} ${fighter.lastName}`.trim();

  // Slug priority: existing column → derived from name → Brave search.
  const slugCandidates: string[] = [];
  if (fighter.ufcAthleteSlug) slugCandidates.push(fighter.ufcAthleteSlug);
  const derived = deriveUFCAthleteSlug(fullName);
  if (derived && !slugCandidates.includes(derived)) slugCandidates.push(derived);

  let imageUrl: string | undefined;
  let usedSlug: string | undefined;
  let lastResult: 'no-page' | 'no-image' | 'error' = 'no-page';

  for (const slug of slugCandidates) {
    const r = await fetchUFCAthleteHeadshot(slug, handle);
    if (r.status === 'ok' && r.imageUrl) {
      if (r.isPlaceholder) {
        // Page resolved but only a silhouette is available. Never downgrade a
        // real photo to a placeholder — leave the existing image alone.
        stats.placeholderSkipped++;
        return;
      }
      if (!isHeadshotTrustworthy(fullName, r.pageTitle, slug)) {
        console.log(`  [reject]  ${fullName}  slug=${slug} title="${r.pageTitle || '<none>'}"`);
        lastResult = 'no-image';
        await sleep(150);
        continue;
      }
      imageUrl = r.imageUrl;
      usedSlug = slug;
      break;
    }
    lastResult = r.status === 'ok' ? 'no-image' : r.status;
    await sleep(150);
  }

  // Search fallback when every derived/existing slug missed.
  if (!imageUrl && (lastResult === 'no-image' || lastResult === 'no-page')) {
    const searchSlug = await searchUFCAthleteSlugViaBrave(fullName);
    if (searchSlug && !slugCandidates.includes(searchSlug)) {
      const r = await fetchUFCAthleteHeadshot(searchSlug, handle);
      if (r.status === 'ok' && r.imageUrl && r.isPlaceholder) {
        stats.placeholderSkipped++;
        return;
      }
      if (r.status === 'ok' && r.imageUrl && isHeadshotTrustworthy(fullName, r.pageTitle, searchSlug)) {
        imageUrl = r.imageUrl;
        usedSlug = searchSlug;
      } else if (r.status === 'ok' && r.imageUrl) {
        console.log(`  [reject]  ${fullName}  search-slug=${searchSlug} title="${r.pageTitle || '<none>'}"`);
        lastResult = 'no-image';
      } else {
        lastResult = r.status === 'ok' ? 'no-image' : r.status;
      }
    }
  }

  if (!imageUrl || !usedSlug) {
    if (lastResult === 'error') { stats.errors++; }
    else if (lastResult === 'no-image') { stats.noImage++; }
    else { stats.noPage++; }
    return;
  }

  // Upload (idempotent on unchanged source url). If the result equals what we
  // already store, the photo hasn't changed — nothing to do.
  let r2Url: string;
  try {
    r2Url = await uploadFighterImage(imageUrl, fullName);
  } catch (err: any) {
    console.log(`  [upload-err] ${fullName}: ${err.message}`);
    stats.errors++;
    return;
  }

  if (r2Url === fighter.profileImage) {
    stats.unchanged++;
    return;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] ${fullName}  slug=${usedSlug}\n             old=${fighter.profileImage || '<none>'}\n             new=${r2Url}`);
    stats.updated++;
    return;
  }

  // Optimistic-concurrency write: only update if the row still holds the value
  // we read (so a concurrent backfill/admin edit isn't clobbered). Also persist
  // the resolved slug when we didn't have one.
  const updateData: { profileImage: string; ufcAthleteSlug?: string } = { profileImage: r2Url };
  if (!fighter.ufcAthleteSlug && usedSlug) updateData.ufcAthleteSlug = usedSlug;

  try {
    const result = await prisma.fighter.updateMany({
      where: { id: fighter.id, profileImage: fighter.profileImage },
      data: updateData,
    });
    if (result.count > 0) {
      stats.updated++;
      console.log(`  [updated] ${fullName}  slug=${usedSlug}`);
    } else {
      stats.skippedConcurrent++;
    }
  } catch (err: any) {
    // P2002: another fighter already owns the derived slug. Retry image-only.
    if (err.code === 'P2002' && updateData.ufcAthleteSlug) {
      try {
        const result = await prisma.fighter.updateMany({
          where: { id: fighter.id, profileImage: fighter.profileImage },
          data: { profileImage: r2Url },
        });
        if (result.count > 0) {
          stats.updated++;
          console.log(`  [updated-noslug] ${fullName}  (slug ${usedSlug} taken by duplicate)`);
        } else {
          stats.skippedConcurrent++;
        }
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
  console.log('[ufc-headshot-refresh] Re-pull recent UFC fighters from ufc.com');
  console.log(`[ufc-headshot-refresh] Window: last ${WINDOW_DAYS} days`);
  console.log(`[ufc-headshot-refresh] Rate limit: ${RATE_LIMIT_MS}ms`);
  console.log(`[ufc-headshot-refresh] Limit: ${LIMIT ?? 'none'}`);
  console.log(`[ufc-headshot-refresh] Dry run: ${DRY_RUN}`);
  console.log(`[ufc-headshot-refresh] Started: ${new Date().toISOString()}`);
  console.log('========================================');

  // Hard requirement: R2 must be configured. Otherwise uploadFighterImage()
  // returns the raw ufc.com url and we'd overwrite hosted R2 images with
  // hot-linked ones — strictly worse. Abort loudly.
  if (!getR2Status().configured) {
    console.error('[ufc-headshot-refresh] R2 is not configured — aborting to avoid downgrading R2 images to raw URLs.');
    process.exit(1);
  }

  const candidates = await findCandidates();
  console.log(`\n[ufc-headshot-refresh] Candidates: ${candidates.length} fighters from UFC cards completed in the last ${WINDOW_DAYS} days`);

  const subset = LIMIT ? candidates.slice(0, LIMIT) : candidates;
  if (LIMIT) console.log(`[ufc-headshot-refresh] After limit: ${subset.length}`);

  const stats: RunStats = {
    considered: 0, updated: 0, unchanged: 0, placeholderSkipped: 0,
    rejected: 0, noPage: 0, noImage: 0, errors: 0, skippedConcurrent: 0,
  };

  const BROWSER_RECYCLE_EVERY = 50;
  console.log('\n[ufc-headshot-refresh] Launching headless Chrome…');
  let handle = await launchAthleteBrowser();
  let processedSinceLaunch = 0;
  try {
    for (let i = 0; i < subset.length; i++) {
      const fighter = subset[i];
      if (i % 25 === 0) console.log(`\n[ufc-headshot-refresh] Progress: ${i}/${subset.length}`);
      if (processedSinceLaunch >= BROWSER_RECYCLE_EVERY) {
        console.log('[ufc-headshot-refresh] Preemptive browser recycle');
        await closeAthleteBrowser(handle).catch(() => {});
        handle = await launchAthleteBrowser();
        processedSinceLaunch = 0;
      }
      try {
        await processFighter(fighter, stats, handle);
      } catch (err: any) {
        console.log(`  [browser-err] ${fighter.firstName} ${fighter.lastName}: ${err.message}`);
        stats.errors++;
        await closeAthleteBrowser(handle).catch(() => {});
        handle = await launchAthleteBrowser();
        processedSinceLaunch = 0;
      }
      processedSinceLaunch++;
      if (i < subset.length - 1) await sleep(RATE_LIMIT_MS);
    }
  } finally {
    await closeAthleteBrowser(handle).catch(() => {});
  }

  console.log('\n========================================');
  console.log('[ufc-headshot-refresh] Summary');
  console.log(`  considered:           ${stats.considered}`);
  console.log(`  updated (photo changed): ${stats.updated}`);
  console.log(`  unchanged:            ${stats.unchanged}`);
  console.log(`  placeholder skipped:  ${stats.placeholderSkipped}`);
  console.log(`  skipped (concurrent): ${stats.skippedConcurrent}`);
  console.log(`  no ufc.com page:      ${stats.noPage}`);
  console.log(`  page exists, no image: ${stats.noImage}`);
  console.log(`  errors:               ${stats.errors}`);
  console.log(`[ufc-headshot-refresh] Done at ${new Date().toISOString()}`);
  console.log('========================================');

  // Only fail on systemic errors, not transient CDN 403 noise.
  const errorRate = stats.considered > 0 ? stats.errors / stats.considered : 0;
  if (errorRate > 0.1) {
    console.log(`[ufc-headshot-refresh] Error rate ${(errorRate * 100).toFixed(1)}% exceeds 10% — marking workflow failed.`);
    process.exitCode = 1;
  }
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(process.exitCode || 0)))
  .catch(async (err) => {
    console.error('[ufc-headshot-refresh] Fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
