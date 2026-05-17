/**
 * Write LLM enrichment records straight onto Fight rows by fightId.
 *
 * The DB is the source of truth for the card (see enrichOneEvent.ts), so by
 * the time we get here every record has a fightId we trust. Structural fields
 * (cardSection, weightClass, isMainEvent) are pulled from the DB row at write
 * time and merged into aiTags so downstream consumers see a stable shape.
 */

import { PrismaClient } from '@prisma/client';
import type { FightEnrichmentRecord, CardItem } from './extractFightEnrichment';

export interface PersistOptions {
  dryRun?: boolean;
}

export interface PersistResult {
  wroteCount: number;
  writtenFightIds: string[];
  uncoveredFightIds: string[]; // card fightIds the LLM didn't return a record for
}

export async function persistEnrichment(
  prisma: PrismaClient,
  card: CardItem[],
  records: FightEnrichmentRecord[],
  sourceUrls: string[],
  opts: PersistOptions = {},
): Promise<PersistResult> {
  const byId = new Map<string, CardItem>();
  for (const c of card) byId.set(c.fightId, c);

  const covered = new Set<string>();
  const written: string[] = [];

  if (!opts.dryRun) {
    for (const rec of records) {
      const cardItem = byId.get(rec.fightId);
      if (!cardItem) continue; // shouldn't happen — already filtered upstream
      covered.add(rec.fightId);
      await prisma.fight.update({
        where: { id: rec.fightId },
        data: {
          aiTags: buildAiTags(rec, cardItem),
          aiPreviewShort: rec.whyCare || null,
          aiSourceUrls: sourceUrls,
          aiConfidence: rec.confidence,
          aiEnrichedAt: new Date(),
        },
      });
      written.push(rec.fightId);
    }
  } else {
    for (const rec of records) {
      if (byId.has(rec.fightId)) covered.add(rec.fightId);
    }
  }

  const uncoveredFightIds = card
    .map((c) => c.fightId)
    .filter((id) => !covered.has(id));

  return {
    wroteCount: written.length,
    writtenFightIds: written,
    uncoveredFightIds,
  };
}

function buildAiTags(rec: FightEnrichmentRecord, cardItem: CardItem) {
  return {
    stakes: rec.stakes,
    storylines: rec.storylines,
    styleTags: rec.styleTags,
    pace: rec.pace,
    riskTier: rec.riskTier,
    rankings: rec.rankings,
    odds: rec.odds,
    isMainEvent: cardItem.isMainEvent,
    cardSection: cardItem.cardSection,
    weightClass: cardItem.weightClass,
  };
}
