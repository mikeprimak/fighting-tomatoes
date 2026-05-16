/**
 * Match LLM-extracted enrichment records against the event's UPCOMING DB
 * fights, then upsert the ai* fields. CANCELLED fights are excluded — this is
 * the bug-shield against stale matchups inflated by Tapology imports.
 *
 * Matching is pair-agnostic (red↔fighter1+blue↔fighter2 OR the flipped
 * orientation) and surname-anchored: the LLM frequently emits "Rousey" /
 * "Ronda Rousey" / "Gina Carano" against DB rows that store first+last
 * separately, so surname overlap is the strongest single signal.
 */

import { PrismaClient } from '@prisma/client';
import { normalizeName, similarityScore } from '../../utils/fighterMatcher';
import type { FightEnrichmentRecord } from './extractFightEnrichment';

const MIN_FIGHTER_SCORE = 0.7;

export interface PersistOptions {
  /** When true, compute matches and report but do NOT write to DB. */
  dryRun?: boolean;
}

export interface PersistedMatch {
  llmRed: string;
  llmBlue: string;
  fightId: string;
  dbRed: string;
  dbBlue: string;
  score: number;
  flipped: boolean;
}

export interface PersistResult {
  matched: PersistedMatch[];
  unmatchedRecords: FightEnrichmentRecord[];      // LLM records that didn't map to any DB fight
  uncoveredDbFightIds: string[];                  // DB UPCOMING fights with no LLM coverage
  wroteCount: number;
}

interface DbFighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
}

interface DbFight {
  id: string;
  fighter1: DbFighter;
  fighter2: DbFighter;
}

export async function persistEnrichment(
  prisma: PrismaClient,
  eventId: string,
  records: FightEnrichmentRecord[],
  sourceUrls: string[],
  opts: PersistOptions = {},
): Promise<PersistResult> {
  const dbFights = (await prisma.fight.findMany({
    where: { eventId, fightStatus: 'UPCOMING' },
    include: {
      fighter1: { select: { id: true, firstName: true, lastName: true, nickname: true } },
      fighter2: { select: { id: true, firstName: true, lastName: true, nickname: true } },
    },
  })) as unknown as DbFight[];

  const matched: PersistedMatch[] = [];
  const unmatched: FightEnrichmentRecord[] = [];
  const usedFightIds = new Set<string>();

  for (const rec of records) {
    let best: { fight: DbFight; score: number; flipped: boolean } | null = null;
    for (const f of dbFights) {
      if (usedFightIds.has(f.id)) continue;
      const straight = pairScore(rec.redFighter, rec.blueFighter, f.fighter1, f.fighter2);
      const flipped = pairScore(rec.redFighter, rec.blueFighter, f.fighter2, f.fighter1);
      const score = Math.max(straight, flipped);
      if (score > (best?.score ?? 0)) {
        best = { fight: f, score, flipped: flipped > straight };
      }
    }
    if (best && best.score >= MIN_FIGHTER_SCORE * 2) {
      // pairScore sums two fighter scores (0..2). Require min on each side via /2 threshold above.
      usedFightIds.add(best.fight.id);
      matched.push({
        llmRed: rec.redFighter,
        llmBlue: rec.blueFighter,
        fightId: best.fight.id,
        dbRed: fullName(best.fight.fighter1),
        dbBlue: fullName(best.fight.fighter2),
        score: best.score,
        flipped: best.flipped,
      });
    } else {
      unmatched.push(rec);
    }
  }

  const uncoveredDbFightIds = dbFights.filter((f) => !usedFightIds.has(f.id)).map((f) => f.id);

  // Write phase.
  let wroteCount = 0;
  if (!opts.dryRun) {
    for (const m of matched) {
      const rec = records.find((r) => r.redFighter === m.llmRed && r.blueFighter === m.llmBlue);
      if (!rec) continue;
      await prisma.fight.update({
        where: { id: m.fightId },
        data: {
          aiTags: buildAiTags(rec),
          aiPreviewShort: rec.whyCare || null,
          aiSourceUrls: sourceUrls,
          aiConfidence: rec.confidence,
          aiEnrichedAt: new Date(),
        },
      });
      wroteCount++;
    }
  }

  return { matched, unmatchedRecords: unmatched, uncoveredDbFightIds, wroteCount };
}

function buildAiTags(rec: FightEnrichmentRecord) {
  return {
    stakes: rec.stakes,
    storylines: rec.storylines,
    styleTags: rec.styleTags,
    pace: rec.pace,
    riskTier: rec.riskTier,
    rankings: rec.rankings,
    odds: rec.odds,
    isMainEvent: rec.isMainEvent,
    cardSection: rec.cardSection,
    weightClass: rec.weightClass,
  };
}

/** Returns a sum of two per-fighter scores in [0, 2]. */
function pairScore(
  llmRed: string,
  llmBlue: string,
  dbA: DbFighter,
  dbB: DbFighter,
): number {
  return fighterScore(llmRed, dbA) + fighterScore(llmBlue, dbB);
}

/** Score one LLM name against one DB fighter (firstName, lastName). 0..1. */
function fighterScore(llmName: string, db: DbFighter): number {
  const llm = normalizeName(llmName);
  const dbFirst = normalizeName(db.firstName);
  const dbLast = normalizeName(db.lastName);
  const dbFull = `${dbFirst} ${dbLast}`.trim();

  if (!llm || !dbLast) return 0;

  // Exact full-name match — strongest signal.
  if (llm === dbFull) return 1.0;

  // Surname appears as a whole word in the LLM string.
  const llmTokens = llm.split(/\s+/);
  if (llmTokens.includes(dbLast)) {
    // Bonus when the first name also appears.
    if (llmTokens.includes(dbFirst)) return 0.98;
    return 0.9;
  }

  // LLM is just the surname.
  if (llm === dbLast) return 0.85;

  // Fuzzy surname (Cyrillic ↔ Latin transliterations etc).
  const llmLast = llmTokens[llmTokens.length - 1];
  const lastSim = similarityScore(llmLast, dbLast);
  if (lastSim >= 0.85) {
    const firstSim = similarityScore(llmTokens[0] ?? '', dbFirst);
    return 0.6 * lastSim + 0.4 * firstSim;
  }

  return 0;
}

function fullName(f: DbFighter): string {
  return `${f.firstName} ${f.lastName}`.trim();
}
