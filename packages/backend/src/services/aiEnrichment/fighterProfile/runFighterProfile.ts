/**
 * Fighter-profile enrichment orchestrator. Designed to run daily from cron.
 *
 * Selection each run — a fighter is a candidate when BOTH hold:
 *   (a) Engagement clears the bar: rating_count >= minRatings OR has any follower.
 *       Engagement is computed from fight_ratings (a fighter inherits every rating
 *       on any of their fights) + follower count — NOT the denormalized
 *       Fighter.totalRatings column, which may not be maintained (the "fields that
 *       lie" lesson).
 *   (b) The profile needs work: never enriched, OR the record changed since
 *       aiProfileRecordAtEnrich (a new win/loss invalidates the story), OR the
 *       profile is older than STALE_DAYS.
 *
 * The cron bar (minRatings) is intentionally LOWER (25) than the one-time backfill
 * bar (100) — the head was hand-backfilled with Opus; the cron extends down the
 * tail and keeps everyone current as records move. Most-engaged first, capped.
 */

import { PrismaClient } from '@prisma/client';
import {
  launchPreviewBrowser,
  closePreviewBrowser,
  type PreviewBrowserHandle,
} from '../fetchUFCEventPreview';
import { enrichOneFighter, type EnrichOneFighterResult } from './enrichOneFighter';

const MS_PER_DAY = 86_400_000;
const DEFAULT_MIN_RATINGS = 25;
const DEFAULT_STALE_DAYS = 180;
const DEFAULT_MAX_FIGHTERS = 40;

export interface RunFighterProfileOptions {
  dryRun?: boolean;
  /** Max fighters to process this run (safety cap). Default 40. */
  maxFighters?: number;
  /** Engagement threshold (rating count). Default 25. */
  minRatings?: number;
  /** Re-enrich profiles older than this many days. Default 180. */
  staleDays?: number;
  /** Restrict to a single fighter id (manual). Bypasses threshold + needs-work. */
  onlyFighterId?: string;
  /** Ignore the engagement bar (manual backfill of an explicit cohort). */
  ignoreThreshold?: boolean;
  minConfidence?: number;
}

export interface RunFighterProfileSummary {
  startedAt: string;
  finishedAt: string;
  candidates: number;
  ran: number;
  wrote: number;
  skippedLowConfidence: number;
  skippedEmpty: number;
  noSources: number;
  results: EnrichOneFighterResult[];
  totalCostUsd: number;
  errors: Array<{ fighterId: string; name: string; message: string }>;
}

interface CandidateRow {
  id: string;
  has_ufc_slug: boolean;
}

export async function runFighterProfileEnrichment(
  prisma: PrismaClient,
  opts: RunFighterProfileOptions = {},
): Promise<RunFighterProfileSummary> {
  const startedAt = new Date();
  const maxFighters = opts.maxFighters ?? DEFAULT_MAX_FIGHTERS;
  const minRatings = opts.minRatings ?? DEFAULT_MIN_RATINGS;
  const staleDays = opts.staleDays ?? DEFAULT_STALE_DAYS;
  const staleCutoff = new Date(Date.now() - staleDays * MS_PER_DAY);

  const summary: RunFighterProfileSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    candidates: 0,
    ran: 0,
    wrote: 0,
    skippedLowConfidence: 0,
    skippedEmpty: 0,
    noSources: 0,
    results: [],
    totalCostUsd: 0,
    errors: [],
  };

  let candidates: CandidateRow[];

  if (opts.onlyFighterId) {
    const f = await prisma.fighter.findUnique({
      where: { id: opts.onlyFighterId },
      select: { id: true, ufcAthleteSlug: true },
    });
    candidates = f ? [{ id: f.id, has_ufc_slug: !!f.ufcAthleteSlug }] : [];
  } else {
    candidates = await selectCandidates(prisma, {
      minRatings,
      staleCutoff,
      maxFighters,
      ignoreThreshold: !!opts.ignoreThreshold,
    });
  }

  summary.candidates = candidates.length;
  if (candidates.length === 0) {
    summary.finishedAt = new Date().toISOString();
    return summary;
  }

  // Launch one stealth browser if any candidate has a UFC athlete page.
  const needsBrowser = candidates.some((c) => c.has_ufc_slug);
  let handle: PreviewBrowserHandle | undefined;
  if (needsBrowser) handle = await launchPreviewBrowser();

  try {
    for (const c of candidates) {
      try {
        const result = await enrichOneFighter(prisma, c.id, {
          dryRun: opts.dryRun,
          browser: c.has_ufc_slug ? handle?.browser : undefined,
          minConfidence: opts.minConfidence,
        });
        summary.results.push(result);
        summary.ran++;
        summary.totalCostUsd += result.costUsd;

        const po = result.persistOutcome;
        let tag: string;
        if (result.abortedReason) {
          if (result.abortedReason === 'no_sources') summary.noSources++;
          tag = `ABORT(${result.abortedReason})`;
        } else if (po?.wrote) {
          summary.wrote++;
          tag = `wrote (conf ${result.confidence?.toFixed(2)})`;
        } else if (po && po.wrote === false) {
          if (po.reason === 'low_confidence') summary.skippedLowConfidence++;
          else summary.skippedEmpty++;
          tag = `skip(${po.reason}, conf ${result.confidence?.toFixed(2)})`;
        } else {
          tag = 'no-op';
        }

        const srcs = result.sourcesFetched.filter((s) => s.ok).map((s) => s.label).join('+') || 'none';
        console.log(
          `[runFighterProfile] ${result.name}  → sources[${srcs}], ${tag}, $${result.costUsd.toFixed(4)}`,
        );
      } catch (err: any) {
        summary.errors.push({ fighterId: c.id, name: c.id, message: String(err?.message ?? err) });
        console.error(`[runFighterProfile] ${c.id} FAILED:`, err?.message ?? err);
      }
    }
  } finally {
    if (handle) await closePreviewBrowser(handle);
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}

/**
 * Engagement-ranked candidate IDs that still need a profile. See the file header
 * for the (a)+(b) selection logic. The record-change expression here MUST match
 * fighterRecordKey() in persistFighterProfile.ts.
 */
async function selectCandidates(
  prisma: PrismaClient,
  args: { minRatings: number; staleCutoff: Date; maxFighters: number; ignoreThreshold: boolean },
): Promise<CandidateRow[]> {
  const { minRatings, staleCutoff, maxFighters, ignoreThreshold } = args;

  const rows = await prisma.$queryRaw<CandidateRow[]>`
    WITH eng AS (
      SELECT fighter_id, COUNT(*)::int AS rating_count
      FROM (
        SELECT f."fighter1Id" AS fighter_id FROM fight_ratings r JOIN fights f ON f.id = r."fightId"
        UNION ALL
        SELECT f."fighter2Id" AS fighter_id FROM fight_ratings r JOIN fights f ON f.id = r."fightId"
      ) x
      WHERE fighter_id IS NOT NULL
      GROUP BY fighter_id
    ),
    fol AS (
      SELECT "fighterId" AS fighter_id, COUNT(*)::int AS follower_count
      FROM user_fighter_follows
      GROUP BY "fighterId"
    )
    SELECT ft.id AS id, (ft."ufcAthleteSlug" IS NOT NULL) AS has_ufc_slug
    FROM fighters ft
    LEFT JOIN eng ON eng.fighter_id = ft.id
    LEFT JOIN fol ON fol.fighter_id = ft.id
    WHERE
      (
        ${ignoreThreshold}
        OR COALESCE(eng.rating_count, 0) >= ${minRatings}
        OR COALESCE(fol.follower_count, 0) > 0
      )
      AND (
        ft."aiProfileEnrichedAt" IS NULL
        OR ft."aiProfileRecordAtEnrich" IS DISTINCT FROM
           (ft.wins || '-' || ft.losses || '-' || ft.draws || '-' || ft."noContests")
        OR ft."aiProfileEnrichedAt" < ${staleCutoff}
      )
    ORDER BY (COALESCE(eng.rating_count, 0) + COALESCE(fol.follower_count, 0) * 3) DESC,
             COALESCE(eng.rating_count, 0) DESC
    LIMIT ${maxFighters}
  `;

  return rows;
}
