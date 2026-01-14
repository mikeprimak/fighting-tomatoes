/**
 * Matching utilities for historical fight data merge
 */

import { PrismaClient } from '@prisma/client';
import { normalizeName, similarityScore, areNameVariations } from '../../utils/fighterMatcher';
import {
  ScrapedEvent,
  ScrapedFight,
  EventMatchResult,
  FightMatchResult,
  MatchConfidence,
} from './mergeTypes';

// Database types for fights with fighter info
interface DbFightWithFighters {
  id: string;
  winner: string | null;
  method: string | null;
  round: number | null;
  time: string | null;
  fighter1Id: string;
  fighter2Id: string;
  fighter1: { firstName: string; lastName: string };
  fighter2: { firstName: string; lastName: string };
  weightClass: string | null;
}

interface DbEvent {
  id: string;
  name: string;
  date: Date;
  promotion: string;
}

/**
 * Normalize event name for matching
 * "UFC 300: Pereira vs. Hill" -> "ufc 300 pereira vs hill"
 */
export function normalizeEventName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[:\-–—]/g, ' ')       // Colons and dashes to spaces
    .replace(/\./g, '')              // Remove periods
    .replace(/\s+/g, ' ')            // Normalize whitespace
    .trim();
}

/**
 * Extract event number from name if present
 * "UFC 300" -> 300, "Bellator 123" -> 123
 */
export function extractEventNumber(name: string): number | null {
  const match = name.match(/(?:ufc|bellator|pfl|one|pride|wec|bkfc|strikeforce)\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Match a scraped event to database events
 */
export async function matchEvent(
  prisma: PrismaClient,
  scrapedEvent: ScrapedEvent,
  promotion: string
): Promise<{ dbEvent: DbEvent | null; confidence: MatchConfidence; reason: string }> {
  const normalizedName = normalizeEventName(scrapedEvent.eventName);
  const eventNumber = extractEventNumber(scrapedEvent.eventName);

  // Strategy 1: Try exact name match (case insensitive)
  let dbEvent = await prisma.event.findFirst({
    where: {
      promotion: { equals: promotion, mode: 'insensitive' },
      name: { equals: scrapedEvent.eventName, mode: 'insensitive' },
    },
  });

  if (dbEvent) {
    return { dbEvent, confidence: 'HIGH', reason: 'Exact name match' };
  }

  // Strategy 2: Try matching by event number (e.g., "UFC 300" matches "UFC 300: Pereira vs Hill")
  if (eventNumber !== null) {
    const promotionPrefix = promotion.toLowerCase();
    dbEvent = await prisma.event.findFirst({
      where: {
        promotion: { equals: promotion, mode: 'insensitive' },
        name: { contains: `${eventNumber}`, mode: 'insensitive' },
      },
    });

    if (dbEvent) {
      // Verify this is actually the right event by checking the number
      const dbEventNumber = extractEventNumber(dbEvent.name);
      if (dbEventNumber === eventNumber) {
        return { dbEvent, confidence: 'HIGH', reason: `Event number match (${eventNumber})` };
      }
    }
  }

  // Strategy 3: Fuzzy name match
  const allEvents = await prisma.event.findMany({
    where: {
      promotion: { equals: promotion, mode: 'insensitive' },
    },
    select: { id: true, name: true, date: true, promotion: true },
  });

  let bestMatch: DbEvent | null = null;
  let bestScore = 0;

  for (const event of allEvents) {
    const normalizedDbName = normalizeEventName(event.name);
    const score = similarityScore(normalizedName, normalizedDbName);

    if (score > bestScore && score >= 0.8) {
      bestScore = score;
      bestMatch = event;
    }
  }

  if (bestMatch) {
    const confidence: MatchConfidence = bestScore >= 0.95 ? 'HIGH' : bestScore >= 0.85 ? 'MEDIUM' : 'LOW';
    return { dbEvent: bestMatch, confidence, reason: `Fuzzy match (${Math.round(bestScore * 100)}%)` };
  }

  return { dbEvent: null, confidence: 'NONE', reason: 'No matching event found' };
}

/**
 * Check if two fighter names match
 */
export function fighterNamesMatch(
  scrapedName: string,
  dbFirstName: string,
  dbLastName: string,
  minSimilarity: number = 0.85
): { matches: boolean; score: number; reason: string } {
  const scrapedNormalized = normalizeName(scrapedName);
  const dbFullName = `${dbFirstName} ${dbLastName}`;
  const dbNormalized = normalizeName(dbFullName);

  // Exact match
  if (scrapedNormalized === dbNormalized) {
    return { matches: true, score: 1.0, reason: 'Exact match' };
  }

  // Check last name match (most important)
  const scrapedParts = scrapedName.trim().split(/\s+/);
  const scrapedLastName = scrapedParts[scrapedParts.length - 1];
  const scrapedFirstName = scrapedParts.slice(0, -1).join(' ') || scrapedParts[0];

  const lastNameScore = similarityScore(normalizeName(scrapedLastName), normalizeName(dbLastName));
  const firstNameScore = similarityScore(normalizeName(scrapedFirstName), normalizeName(dbFirstName));

  // Check for name variations (e.g., "Alex" vs "Alexander")
  const isVariation = areNameVariations(scrapedFirstName, dbFirstName);

  // Combined score: last name weighted more heavily
  let combinedScore = lastNameScore * 0.6 + firstNameScore * 0.4;

  // Boost score if first name is a known variation
  if (isVariation && lastNameScore >= 0.9) {
    combinedScore = Math.max(combinedScore, 0.9);
  }

  if (combinedScore >= minSimilarity) {
    const reason = isVariation
      ? `Name variation match (${Math.round(combinedScore * 100)}%)`
      : `Fuzzy match (${Math.round(combinedScore * 100)}%)`;
    return { matches: true, score: combinedScore, reason };
  }

  // Also try full name similarity as fallback
  const fullNameScore = similarityScore(scrapedNormalized, dbNormalized);
  if (fullNameScore >= minSimilarity) {
    return { matches: true, score: fullNameScore, reason: `Full name match (${Math.round(fullNameScore * 100)}%)` };
  }

  return { matches: false, score: Math.max(combinedScore, fullNameScore), reason: 'No match' };
}

/**
 * Determine winner ID from scraped fight data
 */
export function determineWinner(
  scrapedFight: ScrapedFight,
  dbFight: DbFightWithFighters
): { winnerId: string | null; confidence: MatchConfidence; reason: string } {
  const { winner, loser, method } = scrapedFight;

  // Handle draws and no contests
  const methodLower = method?.toLowerCase() || '';
  if (methodLower.includes('draw')) {
    return { winnerId: 'draw', confidence: 'HIGH', reason: 'Draw result' };
  }
  if (methodLower.includes('no contest') || methodLower === 'nc') {
    return { winnerId: 'nc', confidence: 'HIGH', reason: 'No contest' };
  }

  const fighter1Name = `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`;
  const fighter2Name = `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`;

  // Check if winner matches fighter1
  const winnerMatchesFighter1 = fighterNamesMatch(winner, dbFight.fighter1.firstName, dbFight.fighter1.lastName);
  const winnerMatchesFighter2 = fighterNamesMatch(winner, dbFight.fighter2.firstName, dbFight.fighter2.lastName);

  // Also validate the loser matches the other fighter
  const loserMatchesFighter1 = fighterNamesMatch(loser, dbFight.fighter1.firstName, dbFight.fighter1.lastName);
  const loserMatchesFighter2 = fighterNamesMatch(loser, dbFight.fighter2.firstName, dbFight.fighter2.lastName);

  // Best case: winner and loser both match opposite fighters
  if (winnerMatchesFighter1.matches && loserMatchesFighter2.matches) {
    const avgScore = (winnerMatchesFighter1.score + loserMatchesFighter2.score) / 2;
    const confidence: MatchConfidence = avgScore >= 0.95 ? 'HIGH' : avgScore >= 0.85 ? 'MEDIUM' : 'LOW';
    return {
      winnerId: dbFight.fighter1Id,
      confidence,
      reason: `Winner=${fighter1Name} (${winnerMatchesFighter1.reason}), Loser=${fighter2Name}`,
    };
  }

  if (winnerMatchesFighter2.matches && loserMatchesFighter1.matches) {
    const avgScore = (winnerMatchesFighter2.score + loserMatchesFighter1.score) / 2;
    const confidence: MatchConfidence = avgScore >= 0.95 ? 'HIGH' : avgScore >= 0.85 ? 'MEDIUM' : 'LOW';
    return {
      winnerId: dbFight.fighter2Id,
      confidence,
      reason: `Winner=${fighter2Name} (${winnerMatchesFighter2.reason}), Loser=${fighter1Name}`,
    };
  }

  // Fallback: only winner matches (loser might have name variation we don't recognize)
  if (winnerMatchesFighter1.matches && winnerMatchesFighter1.score >= 0.9) {
    return {
      winnerId: dbFight.fighter1Id,
      confidence: 'MEDIUM',
      reason: `Winner matches ${fighter1Name}, loser "${loser}" doesn't match ${fighter2Name}`,
    };
  }

  if (winnerMatchesFighter2.matches && winnerMatchesFighter2.score >= 0.9) {
    return {
      winnerId: dbFight.fighter2Id,
      confidence: 'MEDIUM',
      reason: `Winner matches ${fighter2Name}, loser "${loser}" doesn't match ${fighter1Name}`,
    };
  }

  // No confident match
  return {
    winnerId: null,
    confidence: 'LOW',
    reason: `Winner "${winner}" doesn't clearly match ${fighter1Name} or ${fighter2Name}`,
  };
}

/**
 * Match a scraped fight to a database fight within an event
 */
export function matchFight(
  scrapedFight: ScrapedFight,
  dbFights: DbFightWithFighters[]
): FightMatchResult {
  const { winner, loser } = scrapedFight;

  // Find fights where the fighters match (in either order)
  for (const dbFight of dbFights) {
    const fighter1Name = `${dbFight.fighter1.firstName} ${dbFight.fighter1.lastName}`;
    const fighter2Name = `${dbFight.fighter2.firstName} ${dbFight.fighter2.lastName}`;

    // Check if this scraped fight matches this db fight
    const winnerMatchesFighter1 = fighterNamesMatch(winner, dbFight.fighter1.firstName, dbFight.fighter1.lastName);
    const winnerMatchesFighter2 = fighterNamesMatch(winner, dbFight.fighter2.firstName, dbFight.fighter2.lastName);
    const loserMatchesFighter1 = fighterNamesMatch(loser, dbFight.fighter1.firstName, dbFight.fighter1.lastName);
    const loserMatchesFighter2 = fighterNamesMatch(loser, dbFight.fighter2.firstName, dbFight.fighter2.lastName);

    // Fight matches if winner/loser map to fighter1/fighter2 (in either direction)
    const matchPattern1 = winnerMatchesFighter1.matches && loserMatchesFighter2.matches;
    const matchPattern2 = winnerMatchesFighter2.matches && loserMatchesFighter1.matches;

    if (matchPattern1 || matchPattern2) {
      const winnerResult = determineWinner(scrapedFight, dbFight);

      return {
        scrapedFight,
        dbFightId: dbFight.id,
        dbFighter1Name: fighter1Name,
        dbFighter2Name: fighter2Name,
        winnerId: winnerResult.winnerId,
        confidence: winnerResult.confidence,
        reason: winnerResult.reason,
      };
    }
  }

  // No match found - return with NONE confidence
  return {
    scrapedFight,
    dbFightId: null,
    dbFighter1Name: '',
    dbFighter2Name: '',
    winnerId: null,
    confidence: 'NONE',
    reason: `No matching fight found for "${winner}" vs "${loser}"`,
  };
}

/**
 * Get all fights for an event that need outcome data
 */
export async function getFightsNeedingOutcome(
  prisma: PrismaClient,
  eventId: string
): Promise<DbFightWithFighters[]> {
  return prisma.fight.findMany({
    where: {
      eventId,
      winner: null,
      isCancelled: false,
    },
    include: {
      fighter1: { select: { firstName: true, lastName: true } },
      fighter2: { select: { firstName: true, lastName: true } },
    },
  });
}

/**
 * Normalize method string to standard format
 */
export function normalizeMethod(method: string): string {
  const m = method.toLowerCase().trim();

  if (m.includes('knockout') || m === 'ko') return 'KO';
  if (m.includes('technical knockout') || m === 'tko') return 'TKO';
  if (m.includes('submission')) return 'Submission';
  if (m.includes('unanimous')) return 'Decision (Unanimous)';
  if (m.includes('split')) return 'Decision (Split)';
  if (m.includes('majority')) return 'Decision (Majority)';
  if (m.includes('decision')) return 'Decision';
  if (m.includes('draw')) return 'Draw';
  if (m.includes('no contest') || m === 'nc') return 'No Contest';
  if (m.includes('disqualification') || m === 'dq') return 'DQ';

  // Return original if no match (capitalized)
  return method.charAt(0).toUpperCase() + method.slice(1);
}
