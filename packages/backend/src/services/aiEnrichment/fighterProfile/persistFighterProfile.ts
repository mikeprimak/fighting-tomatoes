/**
 * Write a fighter-profile enrichment record onto a Fighter row.
 *
 * Mirrors persist.ts / persistPostFight.ts, but targets the aiProfile* columns.
 * Unlike the fight source-url columns (which are appended to), aiProfileSourceUrls
 * is REPLACED each run — a fighter profile is a single synthesized artifact, so
 * the grounding set is whatever this pass used, not an accumulation.
 *
 * Guards: skip below the confidence floor, and skip records with no real content
 * (no summary AND no tldr/careerArc) so we never stamp aiProfileEnrichedAt on an
 * empty profile. recordKey is the change-detection snapshot the cron reads to
 * decide a profile is stale after the fighter's record moves.
 */

import { PrismaClient } from '@prisma/client';
import type { FighterProfileRecord } from './extractFighterProfile';

export const FIGHTER_PROFILE_CONFIDENCE_FLOOR = 0.5;

/**
 * Provenance of a written profile. The cron skips 'handauthored' rows so a premium
 * Opus bio is never overwritten by Haiku; hand-author writes are unconditional so
 * Opus always wins a conflict.
 */
export type FighterProfileSource = 'handauthored' | 'cron-haiku';

export interface PersistFighterProfileOptions {
  dryRun?: boolean;
  minConfidence?: number;
}

export type PersistFighterProfileOutcome =
  | { wrote: true }
  | { wrote: false; reason: 'low_confidence' | 'empty' };

function hasContent(rec: FighterProfileRecord): boolean {
  const p = rec.profile;
  return !!(rec.summary || p.tldr || p.careerArc || p.style || p.appeal || p.highlights.length);
}

/**
 * The record snapshot string. Must match the expression the cron compares
 * against in SQL (wins-losses-draws-noContests) so a record change re-enriches.
 */
export function fighterRecordKey(f: {
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
}): string {
  return `${f.wins}-${f.losses}-${f.draws}-${f.noContests}`;
}

export async function persistFighterProfile(
  prisma: PrismaClient,
  fighterId: string,
  rec: FighterProfileRecord,
  sourceUrls: string[],
  recordKey: string,
  source: FighterProfileSource,
  opts: PersistFighterProfileOptions = {},
): Promise<PersistFighterProfileOutcome> {
  const minConfidence = opts.minConfidence ?? FIGHTER_PROFILE_CONFIDENCE_FLOOR;

  if (rec.confidence < minConfidence) {
    return { wrote: false, reason: 'low_confidence' };
  }
  if (!hasContent(rec)) {
    return { wrote: false, reason: 'empty' };
  }

  if (!opts.dryRun) {
    await prisma.fighter.update({
      where: { id: fighterId },
      data: {
        aiProfile: rec.profile as any,
        aiProfileSummary: rec.summary || null,
        aiProfileConfidence: rec.confidence,
        aiProfileSourceUrls: Array.from(new Set(sourceUrls.filter(Boolean))),
        aiProfileEnrichedAt: new Date(),
        aiProfileRecordAtEnrich: recordKey,
        aiProfileSource: source,
      },
    });
  }

  return { wrote: true };
}
