// Rename-fork guard for daily promotion parsers.
//
// Background (RAF Georgia, 2026-07-10): source sites sometimes correct a
// fighter's name between scrapes ("Khamitov" → "Kuat Khamitov", "Elnazar
// Akhmataliev" → "Ernazar Akmataliev", "Jamalov" → "Zhamalov"). Parsers that
// upsert fighters on exact (firstName, lastName) then create a NEW Fighter row
// for the corrected spelling, which forks a NEW Fight row (Fight identity is
// fighter IDs), strands user data (hype predictions, notification matches) on
// the old fight, and re-fires "just got booked" pushes. The old fight then
// looks "rebooked" to the cancellation pass (its stable fighter appears on the
// forked matchup), bypassing the two-strike rule and cancelling instantly.
//
// The existing guards each miss this case:
//   - two-strike cancellation: bypassed by the rebooked fast-path
//   - sameEventNameDedup (fightUpsert.ts): exact-token overlap only, so it
//     misses whole-name respellings AND would false-positive on genuine
//     opponent swaps sharing a last name (Vinesh → Sangeeta Phogat)
//   - upsertFighterWithFuzzyMatch (fighterMatcher.ts): dead code (fighterAlias
//     table no longer exists) and no parser calls it
//
// This module fixes it at the root: when a scrape resolves ONE side of a bout
// to a known fighter but not the other, check whether the unresolved name is a
// respelling of the anchor's existing opponent on the same event. If so, adopt
// the new spelling on the EXISTING Fighter row and reuse its ID — no fork, no
// cancellation, no duplicate notification.

import { Prisma, PrismaClient } from '@prisma/client';
import { levenshteinDistance, stripDiacritics } from './fighterMatcher';

type AnyPrismaClient = PrismaClient | Prisma.TransactionClient;

/** Normalization used for all name comparisons in this module. Callers building
 *  a `scrapedEventNames` set must use this same function. */
export const normalizeFullName = (s: string): string =>
  stripDiacritics(s || '').toLowerCase().replace(/[''`.\-]/g, '').replace(/\s+/g, ' ').trim();
const norm = normalizeFullName;

/** Similarity threshold for treating two full names as the same person.
 *  Calibrated on the 2026-07-10 RAF renames: "elnazar akhmataliev" vs
 *  "ernazar akmataliev" scores ~0.89 (same person) while the genuine opponent
 *  swap "vinesh phogat" vs "sangeeta phogat" scores ~0.53. */
const RENAME_SIMILARITY_THRESHOLD = 0.85;

/**
 * Pure predicate: is nameB most likely a corrected/expanded spelling of nameA
 * (same human), as opposed to a different person?
 *
 * Two signals, either sufficient:
 *  1. Token subset — every token of the shorter name appears in the longer
 *     one ("Khamitov" ⊂ "Kuat Khamitov"). A mononym gaining a first name is
 *     the most common rename shape.
 *  2. Whole-name Levenshtein similarity ≥ 0.85 — catches respellings like
 *     "Akhmataliev" → "Akmataliev" or "Jamalov" → "Zhamalov" where no token
 *     matches exactly.
 *
 * Deliberately NOT sufficient: sharing only a last name ("Vinesh Phogat" vs
 * "Sangeeta Phogat") — that's the signature of a genuine replacement, often a
 * relative, and must create a new fighter + new fight.
 */
export function isLikelyRenamedFighter(nameA: string, nameB: string): boolean {
  const a = norm(nameA);
  const b = norm(nameB);
  if (!a || !b) return false;
  if (a === b) return true;

  const aTokens = a.split(' ');
  const bTokens = b.split(' ');
  const [shorter, longer] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  const longerSet = new Set(longer);
  if (shorter.every((t) => longerSet.has(t))) return true;

  const maxLen = Math.max(a.length, b.length);
  const similarity = 1 - levenshteinDistance(a, b) / maxLen;
  return similarity >= RENAME_SIMILARITY_THRESHOLD;
}

export interface RenamedOpponentQuery {
  eventId: string;
  /** Fighter ID of the side of the bout that DID resolve to a known fighter. */
  anchorFighterId: string;
  /** Raw scraped name of the side that did NOT resolve. */
  scrapedOpponentName: string;
  /**
   * Normalized full names of every fighter in THIS event's scrape. If the
   * anchor's existing opponent still appears elsewhere on the scraped card
   * under their old name, they were NOT renamed — the anchor genuinely has a
   * new opponent — so we must not rename.
   */
  scrapedEventNames: Set<string>;
}

/**
 * If the scraped-but-unknown opponent name is a respelling of the anchor's
 * existing opponent on this event, adopt the new spelling on that existing
 * Fighter row and return its ID. Returns null when this looks like a genuine
 * new opponent (caller proceeds to create a fighter as before).
 */
export async function resolveRenamedOpponent(
  prisma: AnyPrismaClient,
  query: RenamedOpponentQuery,
): Promise<string | null> {
  const { eventId, anchorFighterId, scrapedOpponentName, scrapedEventNames } = query;

  const anchorFights = await prisma.fight.findMany({
    where: {
      eventId,
      fightStatus: { notIn: ['CANCELLED', 'COMPLETED'] },
      OR: [{ fighter1Id: anchorFighterId }, { fighter2Id: anchorFighterId }],
    },
    select: {
      id: true,
      fighter1Id: true,
      fighter1: { select: { id: true, firstName: true, lastName: true } },
      fighter2: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  for (const fight of anchorFights) {
    const oldOpponent = fight.fighter1Id === anchorFighterId ? fight.fighter2 : fight.fighter1;
    const oldName = `${oldOpponent.firstName} ${oldOpponent.lastName}`.trim();

    // Old opponent still on the scraped card under their old name → they exist
    // independently and the anchor has a real new opponent. Don't rename.
    if (scrapedEventNames.has(norm(oldName))) continue;

    if (!isLikelyRenamedFighter(oldName, scrapedOpponentName)) continue;

    const cleaned = stripDiacritics(scrapedOpponentName).trim();
    const parts = cleaned.split(/\s+/);
    const firstName = parts.length === 1 ? '' : parts[0];
    const lastName = parts.length === 1 ? parts[0] : parts.slice(1).join(' ');

    // If a fighter row already exists under the new spelling (e.g. a fork
    // already happened on an earlier scrape), reuse it rather than violating
    // the (firstName, lastName) unique by renaming onto it.
    const existingUnderNewName = await prisma.fighter.findFirst({
      where: {
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existingUnderNewName) {
      console.warn(
        `ℹ️  RENAME-GUARD: "${scrapedOpponentName}" already exists as a separate fighter row — ` +
          `reusing it (fight ${fight.id} on event ${eventId} may be a pre-existing fork; review).`,
      );
      return existingUnderNewName.id;
    }

    await prisma.fighter.update({
      where: { id: oldOpponent.id },
      data: { firstName, lastName },
    });
    console.warn(
      `ℹ️  RENAME-GUARD: source respelled "${oldName}" → "${cleaned}" (event ${eventId}, ` +
        `fight ${fight.id}) — renamed existing fighter ${oldOpponent.id} in place instead of forking a duplicate.`,
    );
    return oldOpponent.id;
  }

  return null;
}

/** Exact (case-insensitive) DB lookup used as a fallback when a parser's
 *  in-run name/url map misses — ensures the rename guard always has its anchor
 *  (the map only knows fighters seen in THIS scrape's athlete import). */
export async function findExactFighterId(
  prisma: AnyPrismaClient,
  firstName: string,
  lastName: string,
): Promise<string | undefined> {
  if (!firstName && !lastName) return undefined;
  const existing = await prisma.fighter.findFirst({
    where: {
      firstName: { equals: firstName, mode: 'insensitive' },
      lastName: { equals: lastName, mode: 'insensitive' },
    },
    select: { id: true },
  });
  return existing?.id;
}

export interface RenamedPairQuery {
  eventId: string;
  fighter1Id: string | undefined;
  fighter2Id: string | undefined;
  /** Raw scraped names for the two corners, same order as the IDs. */
  scrapedName1: string;
  scrapedName2: string;
  /** See RenamedOpponentQuery.scrapedEventNames (normalizeFullName'd). */
  scrapedEventNames: Set<string>;
  /** IDs never valid as a rename anchor (e.g. a TBA placeholder fighter). */
  excludeFighterIds?: Set<string>;
}

/**
 * Parser-facing wrapper: when exactly one side of a bout resolved, run the
 * rename-fork guard on the unresolved side. Never throws (a guard failure
 * falls back to the parser's normal create path). Returns the — possibly
 * updated — fighter-ID pair.
 */
export async function resolveRenamedPair(
  prisma: AnyPrismaClient,
  q: RenamedPairQuery,
): Promise<{ fighter1Id: string | undefined; fighter2Id: string | undefined }> {
  const { fighter1Id, fighter2Id } = q;
  if (!!fighter1Id === !!fighter2Id) return { fighter1Id, fighter2Id };
  const anchorFighterId = (fighter1Id ?? fighter2Id)!;
  if (q.excludeFighterIds?.has(anchorFighterId)) return { fighter1Id, fighter2Id };
  const missingName = fighter1Id ? q.scrapedName2 : q.scrapedName1;
  if (!normalizeFullName(missingName || '')) return { fighter1Id, fighter2Id };
  const renamedId = await resolveRenamedOpponent(prisma, {
    eventId: q.eventId,
    anchorFighterId,
    scrapedOpponentName: missingName,
    scrapedEventNames: q.scrapedEventNames,
  }).catch((err) => {
    console.warn('    ⚠ Rename-fork guard failed, falling back to create:', err);
    return null;
  });
  if (!renamedId) return { fighter1Id, fighter2Id };
  return fighter1Id
    ? { fighter1Id, fighter2Id: renamedId }
    : { fighter1Id: renamedId, fighter2Id };
}
