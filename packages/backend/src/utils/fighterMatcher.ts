/**
 * Fighter Name Matching Utilities
 *
 * Provides fuzzy matching for fighter names to prevent duplicate entries
 * and detect existing duplicates in the database.
 */

import { PrismaClient, Gender, Sport, WeightClass, Prisma } from '@prisma/client';

// Levenshtein distance implementation
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create a 2D array to store distances
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill in the rest
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

// Calculate similarity score (0-1, where 1 is identical)
export function similarityScore(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - (distance / maxLen);
}

/**
 * Strip diacritics from a name while preserving casing and spaces.
 * Used when storing names in the DB so they're human-readable but ASCII-safe.
 * Examples: "Błachowicz" → "Blachowicz", "Farès" → "Fares", "Rakić" → "Rakic"
 */
export function stripDiacritics(name: string): string {
  if (!name) return '';
  return name
    // Replace special chars that NFKD doesn't decompose
    .replace(/[łŁ]/g, m => m === 'ł' ? 'l' : 'L')
    .replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D')
    .replace(/[øØ]/g, m => m === 'ø' ? 'o' : 'O')
    .replace(/[æÆ]/g, m => m === 'æ' ? 'ae' : 'Ae')
    .replace(/[ßẞ]/g, 'ss')
    // Apply Unicode NFKD decomposition to split diacritics into base + combining mark
    .normalize('NFKD')
    // Strip combining marks, leaving ASCII equivalents
    .replace(/[\u0300-\u036f]/g, '');
}

// Normalize a name for comparison (remove accents, lowercase, trim)
export function normalizeName(name: string): string {
  return name
    // Replace special chars that NFKD doesn't decompose
    .replace(/[łŁ]/g, 'l')
    .replace(/[đĐ]/g, 'd')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[ßẞ]/g, 'ss')
    .toLowerCase()
    .trim()
    // Remove accents/diacritics
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove common suffixes/prefixes
    .replace(/^(the|el|la|le)\s+/i, '')
    // Remove punctuation
    .replace(/[''`.-]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ');
}

// Common name variations mapping
const NAME_VARIATIONS: Record<string, string[]> = {
  'alexander': ['alex', 'aleksander', 'aleksandr', 'sasha'],
  'michael': ['mike', 'mick', 'mickey', 'mikhail'],
  'william': ['will', 'bill', 'billy', 'willy'],
  'robert': ['rob', 'bob', 'bobby', 'robbie'],
  'richard': ['rich', 'rick', 'dick', 'ricky'],
  'christopher': ['chris', 'cristopher'],
  'jonathan': ['jon', 'john', 'johnny', 'jonny'],
  'john': ['jon', 'johnny', 'jonny'],
  'joseph': ['joe', 'joey', 'jose'],
  'jose': ['joe', 'joseph'],
  'anthony': ['tony', 'antonio'],
  'antonio': ['tony', 'anthony'],
  'daniel': ['dan', 'danny'],
  'james': ['jim', 'jimmy', 'jamie'],
  'matthew': ['matt', 'matty'],
  'nicholas': ['nick', 'nicky', 'nicolas'],
  'benjamin': ['ben', 'benny'],
  'joshua': ['josh'],
  'samuel': ['sam', 'sammy'],
  'david': ['dave', 'davey'],
  'edward': ['ed', 'eddie', 'ted', 'teddy'],
  'thomas': ['tom', 'tommy'],
  'charles': ['charlie', 'chuck'],
  'peter': ['pete'],
  'stephen': ['steve', 'steven'],
  'steven': ['steve', 'stephen'],
  'patrick': ['pat', 'paddy'],
  'francis': ['frank', 'frankie'],
  'francisco': ['frank', 'frankie', 'paco'],
  'eugene': ['gene'],
  'raymond': ['ray'],
  'timothy': ['tim', 'timmy'],
  'phillip': ['phil'],
  'vicente': ['vincente', 'vincent'],
  'andrei': ['andrey', 'andre', 'andrew'],
  'dmitry': ['dmitri', 'dimitri', 'dima'],
  'sergei': ['sergey', 'serge'],
  'aleksei': ['alexei', 'alexey', 'alex'],
  'paulo': ['paul', 'paolo'],
  'paulo': ['paul'],
  'junior': ['jr'],
};

// Check if two first names are likely variations of each other
export function areNameVariations(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return true;

  // Check if one is a known variation of the other
  for (const [canonical, variations] of Object.entries(NAME_VARIATIONS)) {
    const allForms = [canonical, ...variations];
    if (allForms.includes(n1) && allForms.includes(n2)) {
      return true;
    }
  }

  // Check if one name starts with the other (e.g., "Alex" vs "Alexander")
  if (n1.startsWith(n2) || n2.startsWith(n1)) {
    const shorter = n1.length < n2.length ? n1 : n2;
    if (shorter.length >= 3) return true;
  }

  return false;
}

export interface FighterMatch {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  similarityScore: number;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'variation';
}

export interface DuplicateCandidate {
  fighter1: { id: string; firstName: string; lastName: string };
  fighter2: { id: string; firstName: string; lastName: string };
  similarity: number;
  reason: string;
}

/**
 * Find potential matches for a fighter name in the database
 */
export async function findFighterMatches(
  prisma: PrismaClient,
  firstName: string,
  lastName: string,
  options: {
    minSimilarity?: number;
    limit?: number;
    includeAliases?: boolean;
  } = {}
): Promise<FighterMatch[]> {
  const { minSimilarity = 0.7, limit = 10, includeAliases = true } = options;

  const normalizedFirst = normalizeName(firstName);
  const normalizedLast = normalizeName(lastName);
  const searchFullName = `${normalizedFirst} ${normalizedLast}`;

  // First, check for exact match
  const exactMatch = await prisma.fighter.findFirst({
    where: {
      firstName: { equals: firstName, mode: 'insensitive' },
      lastName: { equals: lastName, mode: 'insensitive' },
    },
  });

  if (exactMatch) {
    return [{
      id: exactMatch.id,
      firstName: exactMatch.firstName,
      lastName: exactMatch.lastName,
      fullName: `${exactMatch.firstName} ${exactMatch.lastName}`,
      similarityScore: 1.0,
      matchType: 'exact',
    }];
  }

  // Check aliases
  if (includeAliases) {
    const aliasMatch = await prisma.fighterAlias.findFirst({
      where: {
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      include: { fighter: true },
    });

    if (aliasMatch) {
      return [{
        id: aliasMatch.fighter.id,
        firstName: aliasMatch.fighter.firstName,
        lastName: aliasMatch.fighter.lastName,
        fullName: `${aliasMatch.fighter.firstName} ${aliasMatch.fighter.lastName}`,
        similarityScore: 1.0,
        matchType: 'alias',
      }];
    }
  }

  // Get all fighters for fuzzy matching (in production, consider limiting by last name initial)
  const allFighters = await prisma.fighter.findMany({
    select: { id: true, firstName: true, lastName: true },
  });

  const matches: FighterMatch[] = [];

  for (const fighter of allFighters) {
    const fighterNormalizedFirst = normalizeName(fighter.firstName);
    const fighterNormalizedLast = normalizeName(fighter.lastName);
    const fighterFullName = `${fighterNormalizedFirst} ${fighterNormalizedLast}`;

    // Calculate similarity
    const lastNameSim = similarityScore(normalizedLast, fighterNormalizedLast);
    const firstNameSim = similarityScore(normalizedFirst, fighterNormalizedFirst);
    const fullNameSim = similarityScore(searchFullName, fighterFullName);

    // Check for name variations
    const isVariation = areNameVariations(firstName, fighter.firstName) && lastNameSim > 0.85;

    // Combined score (last name matters more)
    const combinedScore = isVariation
      ? Math.max(0.9, (lastNameSim * 0.6 + firstNameSim * 0.4))
      : Math.max(fullNameSim, (lastNameSim * 0.6 + firstNameSim * 0.4));

    if (combinedScore >= minSimilarity) {
      matches.push({
        id: fighter.id,
        firstName: fighter.firstName,
        lastName: fighter.lastName,
        fullName: `${fighter.firstName} ${fighter.lastName}`,
        similarityScore: combinedScore,
        matchType: isVariation ? 'variation' : 'fuzzy',
      });
    }
  }

  // Sort by similarity and limit
  return matches
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}

/**
 * Find all potential duplicate fighters in the database
 */
export async function findAllDuplicates(
  prisma: PrismaClient,
  options: {
    minSimilarity?: number;
    sameLastNameOnly?: boolean;
  } = {}
): Promise<DuplicateCandidate[]> {
  const { minSimilarity = 0.85, sameLastNameOnly = true } = options;

  const allFighters = await prisma.fighter.findMany({
    select: { id: true, firstName: true, lastName: true },
    orderBy: { lastName: 'asc' },
  });

  const duplicates: DuplicateCandidate[] = [];
  const checked = new Set<string>();

  for (let i = 0; i < allFighters.length; i++) {
    const fighter1 = allFighters[i];
    const f1First = normalizeName(fighter1.firstName);
    const f1Last = normalizeName(fighter1.lastName);

    for (let j = i + 1; j < allFighters.length; j++) {
      const fighter2 = allFighters[j];
      const pairKey = [fighter1.id, fighter2.id].sort().join('-');

      if (checked.has(pairKey)) continue;
      checked.add(pairKey);

      const f2First = normalizeName(fighter2.firstName);
      const f2Last = normalizeName(fighter2.lastName);

      // Optimization: if sameLastNameOnly and last names are very different, skip
      if (sameLastNameOnly) {
        const lastNameSim = similarityScore(f1Last, f2Last);
        if (lastNameSim < 0.8) continue;
      }

      // Check for name variation
      const isVariation = areNameVariations(fighter1.firstName, fighter2.firstName);
      const lastNameSim = similarityScore(f1Last, f2Last);

      if (isVariation && lastNameSim > 0.85) {
        duplicates.push({
          fighter1: { id: fighter1.id, firstName: fighter1.firstName, lastName: fighter1.lastName },
          fighter2: { id: fighter2.id, firstName: fighter2.firstName, lastName: fighter2.lastName },
          similarity: Math.max(0.9, lastNameSim),
          reason: `Name variation: ${fighter1.firstName} ↔ ${fighter2.firstName}`,
        });
        continue;
      }

      // Check full name similarity
      const fullName1 = `${f1First} ${f1Last}`;
      const fullName2 = `${f2First} ${f2Last}`;
      const fullSim = similarityScore(fullName1, fullName2);

      if (fullSim >= minSimilarity) {
        duplicates.push({
          fighter1: { id: fighter1.id, firstName: fighter1.firstName, lastName: fighter1.lastName },
          fighter2: { id: fighter2.id, firstName: fighter2.firstName, lastName: fighter2.lastName },
          similarity: fullSim,
          reason: `Similar names (${Math.round(fullSim * 100)}% match)`,
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Find or create a fighter, using fuzzy matching to prevent duplicates
 */
export async function findOrCreateFighter(
  prisma: PrismaClient,
  firstName: string,
  lastName: string,
  options: {
    gender: 'MALE' | 'FEMALE';
    minMatchSimilarity?: number;
    createIfNotFound?: boolean;
    additionalData?: Partial<{
      nickname: string;
      wins: number;
      losses: number;
      draws: number;
      weightClass: string;
      profileImage: string;
    }>;
  }
): Promise<{ fighter: { id: string; firstName: string; lastName: string } | null; wasCreated: boolean; matchInfo?: FighterMatch }> {
  const { gender, minMatchSimilarity = 0.85, createIfNotFound = true, additionalData = {} } = options;

  // Look for matches
  const matches = await findFighterMatches(prisma, firstName, lastName, {
    minSimilarity: minMatchSimilarity,
    limit: 1,
    includeAliases: true,
  });

  if (matches.length > 0 && matches[0].similarityScore >= minMatchSimilarity) {
    const match = matches[0];

    // If it's a fuzzy match (not exact), store the alias for future lookups
    if (match.matchType === 'fuzzy' || match.matchType === 'variation') {
      // Check if alias already exists
      const existingAlias = await prisma.fighterAlias.findFirst({
        where: {
          firstName: { equals: firstName, mode: 'insensitive' },
          lastName: { equals: lastName, mode: 'insensitive' },
        },
      });

      if (!existingAlias) {
        await prisma.fighterAlias.create({
          data: {
            fighterId: match.id,
            firstName,
            lastName,
            source: 'auto_match',
          },
        });
      }
    }

    return {
      fighter: { id: match.id, firstName: match.firstName, lastName: match.lastName },
      wasCreated: false,
      matchInfo: match,
    };
  }

  // No match found
  if (!createIfNotFound) {
    return { fighter: null, wasCreated: false };
  }

  // Create new fighter
  const newFighter = await prisma.fighter.create({
    data: {
      firstName,
      lastName,
      gender,
      ...additionalData,
    },
  });

  return {
    fighter: { id: newFighter.id, firstName: newFighter.firstName, lastName: newFighter.lastName },
    wasCreated: true,
  };
}

/**
 * Fighter upsert data type for scrapers
 */
export interface FighterUpsertData {
  firstName: string;
  lastName: string;
  gender: Gender;
  nickname?: string | null;
  wins?: number;
  losses?: number;
  draws?: number;
  noContests?: number;
  profileImage?: string | null;
  actionImage?: string | null;
  weightClass?: WeightClass | null;
  sport?: Sport;
  isActive?: boolean;
  isChampion?: boolean;
  championshipTitle?: string | null;
  rank?: string | null;
}

/**
 * Drop-in replacement for prisma.fighter.upsert that uses fuzzy matching.
 *
 * This function:
 * 1. First checks for an exact name match
 * 2. Then checks aliases table for known name variations
 * 3. Then uses fuzzy matching to find similar names
 * 4. Creates a new fighter only if no match is found
 * 5. Automatically creates aliases for fuzzy matches
 *
 * Usage in scrapers - replace:
 *   const fighter = await prisma.fighter.upsert({
 *     where: { firstName_lastName: { firstName, lastName } },
 *     update: { ... },
 *     create: { firstName, lastName, gender, ... }
 *   });
 *
 * With:
 *   const fighter = await upsertFighterWithFuzzyMatch(prisma, {
 *     firstName, lastName, gender, ...otherData
 *   });
 */
export async function upsertFighterWithFuzzyMatch(
  prisma: PrismaClient,
  data: FighterUpsertData,
  options: {
    minSimilarity?: number;
    logMatches?: boolean;
  } = {}
): Promise<{ id: string; firstName: string; lastName: string; wasCreated: boolean; matchType?: string }> {
  const { minSimilarity = 0.85, logMatches = false } = options;
  const { firstName, lastName, gender, ...updateData } = data;

  // 1. Try exact match first (most common case)
  const exactMatch = await prisma.fighter.findFirst({
    where: {
      firstName: { equals: firstName, mode: 'insensitive' },
      lastName: { equals: lastName, mode: 'insensitive' },
    },
  });

  if (exactMatch) {
    // Update existing fighter
    const updated = await prisma.fighter.update({
      where: { id: exactMatch.id },
      data: updateData,
    });
    return { id: updated.id, firstName: updated.firstName, lastName: updated.lastName, wasCreated: false, matchType: 'exact' };
  }

  // 2. Check aliases table
  const aliasMatch = await prisma.fighterAlias.findFirst({
    where: {
      firstName: { equals: firstName, mode: 'insensitive' },
      lastName: { equals: lastName, mode: 'insensitive' },
    },
    include: { fighter: true },
  });

  if (aliasMatch) {
    // Update the canonical fighter
    const updated = await prisma.fighter.update({
      where: { id: aliasMatch.fighterId },
      data: updateData,
    });
    if (logMatches) {
      console.log(`  📎 Alias match: "${firstName} ${lastName}" → "${updated.firstName} ${updated.lastName}"`);
    }
    return { id: updated.id, firstName: updated.firstName, lastName: updated.lastName, wasCreated: false, matchType: 'alias' };
  }

  // 3. Fuzzy match
  const matches = await findFighterMatches(prisma, firstName, lastName, {
    minSimilarity,
    limit: 1,
    includeAliases: false, // Already checked above
  });

  if (matches.length > 0 && matches[0].similarityScore >= minSimilarity) {
    const match = matches[0];

    if (logMatches) {
      console.log(`  🔍 Fuzzy match (${Math.round(match.similarityScore * 100)}%): "${firstName} ${lastName}" → "${match.firstName} ${match.lastName}"`);
    }

    // Create alias for future lookups
    try {
      await prisma.fighterAlias.create({
        data: {
          fighterId: match.id,
          firstName,
          lastName,
          source: 'scraper_fuzzy',
        },
      });
    } catch (e) {
      // Alias might already exist, ignore
    }

    // Update the matched fighter
    const updated = await prisma.fighter.update({
      where: { id: match.id },
      data: updateData,
    });

    return { id: updated.id, firstName: updated.firstName, lastName: updated.lastName, wasCreated: false, matchType: match.matchType };
  }

  // 4. No match found - create new fighter
  try {
    const newFighter = await prisma.fighter.create({
      data: {
        firstName,
        lastName,
        gender,
        ...updateData,
      },
    });

    return { id: newFighter.id, firstName: newFighter.firstName, lastName: newFighter.lastName, wasCreated: true };
  } catch (e) {
    // Handle race condition - another process might have created the same fighter
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existingFighter = await prisma.fighter.findFirst({
        where: {
          firstName: { equals: firstName, mode: 'insensitive' },
          lastName: { equals: lastName, mode: 'insensitive' },
        },
      });

      if (existingFighter) {
        const updated = await prisma.fighter.update({
          where: { id: existingFighter.id },
          data: updateData,
        });
        return { id: updated.id, firstName: updated.firstName, lastName: updated.lastName, wasCreated: false, matchType: 'race_condition' };
      }
    }
    throw e;
  }
}
