/**
 * Write post-fight enrichment records onto Fight rows by fightId.
 *
 * Mirrors persist.ts (pre-fight), but targets the aiPostFight* columns and is
 * additive — it never touches the pre-fight ai* fields. Only writes records
 * that cleared the confidence floor and carried real narrative (a bare result
 * with no editorial recap should have been omitted upstream, but we guard here
 * too so we never stamp aiPostFightEnrichedAt on an empty record).
 */

import { PrismaClient } from '@prisma/client';
import type {
  PostFightEnrichmentRecord,
  PostFightCardItem,
} from './extractPostFightEnrichment';

const CONFIDENCE_FLOOR = 0.5;

export interface PersistPostFightOptions {
  dryRun?: boolean;
  /** Records below this confidence are skipped. Default 0.5. */
  minConfidence?: number;
}

export interface PersistPostFightResult {
  wroteCount: number;
  writtenFightIds: string[];
  skippedLowConfidence: string[];
  skippedEmpty: string[];
  uncoveredFightIds: string[]; // card fightIds with no record at all
}

function hasNarrative(rec: PostFightEnrichmentRecord): boolean {
  const t = rec.tags;
  return !!(
    rec.summary ||
    t.methodNarrative ||
    t.momentDescription ||
    t.bonuses.length ||
    t.callouts.length ||
    t.aftermath.length ||
    t.fotyConsideration ||
    // Structured character tags are themselves worth persisting (they feed Fan DNA
    // taste analytics), even when the model produced no prose for this fight.
    t.character
  );
}

export async function persistPostFightEnrichment(
  prisma: PrismaClient,
  card: PostFightCardItem[],
  records: PostFightEnrichmentRecord[],
  sourceUrls: string[],
  opts: PersistPostFightOptions = {},
): Promise<PersistPostFightResult> {
  const minConfidence = opts.minConfidence ?? CONFIDENCE_FLOOR;
  const validIds = new Set(card.map((c) => c.fightId));

  const written: string[] = [];
  const skippedLowConfidence: string[] = [];
  const skippedEmpty: string[] = [];
  const covered = new Set<string>();

  for (const rec of records) {
    if (!validIds.has(rec.fightId)) continue; // already filtered upstream, belt-and-suspenders
    if (rec.confidence < minConfidence) {
      skippedLowConfidence.push(rec.fightId);
      continue;
    }
    if (!hasNarrative(rec)) {
      skippedEmpty.push(rec.fightId);
      continue;
    }
    covered.add(rec.fightId);
    if (!opts.dryRun) {
      await prisma.fight.update({
        where: { id: rec.fightId },
        data: {
          aiPostFightTags: rec.tags as any,
          aiPostFightSummary: rec.summary || null,
          aiPostFightEnrichedAt: new Date(),
          // Append recap grounding URLs without clobbering the pre-fight
          // sources. Dedup is gated by aiPostFightEnrichedAt upstream, so this
          // appends each URL effectively once per fight.
          aiSourceUrls: { push: Array.from(new Set(sourceUrls.filter(Boolean))) },
        },
      });
    }
    written.push(rec.fightId);
  }

  const uncoveredFightIds = card
    .map((c) => c.fightId)
    .filter((id) => !covered.has(id));

  return {
    wroteCount: written.length,
    writtenFightIds: written,
    skippedLowConfidence,
    skippedEmpty,
    uncoveredFightIds,
  };
}
