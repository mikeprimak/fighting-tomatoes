/**
 * Pundit identity resolution for the "What the media said" strip.
 *
 * The extractor returns a speaker NAME as it appeared in the article ("Chael P.
 * Sonnen", "Sonnen", "Ariel Helwani"). This module folds those to one canonical
 * Pundit row so quotes accrue per person rather than per spelling — that
 * cross-fight queryability is the whole reason quotes live in a table.
 *
 * Unknown speakers are auto-created with the LLM-classified role (the
 * no-review-inbox precedent, Decision §4 in the plan). Spot-check the first
 * ~10 outputs of any new run per the QA rule.
 */

import type { PrismaClient } from '@prisma/client';

export const PUNDIT_ROLES = ['journalist', 'analyst', 'ex_fighter', 'broadcaster', 'other'] as const;
export type PunditRole = (typeof PUNDIT_ROLES)[number];

export function normalizeRole(raw: unknown): PunditRole {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  return (PUNDIT_ROLES as readonly string[]).includes(t) ? (t as PunditRole) : 'other';
}

/**
 * Fold a display name to a lookup key: lowercase, strip punctuation/middle
 * initials/accents, collapse whitespace. "Chael P. Sonnen" -> "chael sonnen".
 */
export function punditKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/\b[a-z]\.\s*/g, '')      // drop middle initials ("chael p. sonnen")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function punditSlug(name: string): string {
  return punditKey(name).replace(/\s+/g, '-');
}

/**
 * Seed registry: known voices with the aliases they're actually printed under.
 * Normalization only — this list is not an allowlist, unknown speakers are still
 * accepted and auto-created. `excluded: true` rows are the belt-and-suspenders
 * on top of the prompt's exclusion rule (promoters speaking as promoters).
 */
export const SEED_PUNDITS: Array<{
  name: string;
  role: PunditRole;
  aliases?: string[];
  excluded?: boolean;
}> = [
  { name: 'Ariel Helwani', role: 'journalist', aliases: ['Helwani'] },
  { name: 'Michael Bisping', role: 'ex_fighter', aliases: ['Bisping', 'The Count'] },
  { name: 'Chael Sonnen', role: 'ex_fighter', aliases: ['Sonnen', 'Chael P. Sonnen'] },
  { name: 'Luke Thomas', role: 'analyst' },
  { name: 'Brett Okamoto', role: 'journalist', aliases: ['Okamoto'] },
  { name: 'Marc Raimondi', role: 'journalist', aliases: ['Raimondi'] },
  { name: 'Guilherme Cruz', role: 'journalist' },
  { name: 'Mike Bohn', role: 'journalist' },
  { name: 'John Morgan', role: 'journalist' },
  { name: 'Din Thomas', role: 'ex_fighter' },
  { name: 'Daniel Cormier', role: 'ex_fighter', aliases: ['DC', 'Cormier'] },
  { name: 'Dominick Cruz', role: 'ex_fighter' },
  { name: 'Joe Rogan', role: 'broadcaster', aliases: ['Rogan'] },
  { name: 'Jon Anik', role: 'broadcaster', aliases: ['Anik'] },
  { name: 'Paul Felder', role: 'ex_fighter' },
  { name: 'Michael Chiesa', role: 'ex_fighter' },
  { name: 'Chris Weidman', role: 'ex_fighter' },
  { name: 'Robert Griffin III', role: 'other', aliases: ['RGIII', 'RG3'] },
  { name: 'Brian Campbell', role: 'journalist' },
  { name: 'Shaheen Al-Shatti', role: 'journalist' },
  { name: 'Damon Martin', role: 'journalist' },
  { name: 'Nolan King', role: 'journalist' },
  { name: 'Alexander K. Lee', role: 'journalist' },
  { name: 'Jed Meshew', role: 'journalist' },
  { name: 'Chuck Mindenhall', role: 'journalist' },
  { name: 'Jonathan Snowden', role: 'journalist' },
  { name: 'Kevin Iole', role: 'journalist', aliases: ['Iole'] },
  { name: 'Josh Thomson', role: 'ex_fighter' },
  { name: 'Anthony Smith', role: 'ex_fighter', aliases: ['Lionheart'] },

  // Promotion voices — stored so their quotes resolve to a real row and can be
  // audited, but hard-excluded from display: a promoter selling his own show is
  // not the media reacting to it.
  { name: 'Dana White', role: 'other', excluded: true },
  { name: 'Hunter Campbell', role: 'other', excluded: true },
  { name: 'Sean Shelby', role: 'other', excluded: true },
  { name: 'Mick Maynard', role: 'other', excluded: true },
  { name: 'David Feldman', role: 'other', excluded: true },
  { name: 'Chatri Sityodtong', role: 'other', excluded: true },
];

type PunditRow = { id: string; excluded: boolean };

/**
 * Resolve a speaker name to a Pundit row, creating it if unknown.
 *
 * Lookup order: exact slug, then alias match, then create. `cache` is a
 * per-run memo keyed by punditKey so one event's repeated speakers cost one
 * query each at most.
 */
export async function resolvePundit(
  prisma: PrismaClient,
  name: string,
  role: unknown,
  cache: Map<string, PunditRow>,
): Promise<PunditRow | null> {
  const key = punditKey(name);
  if (!key) return null;

  const memo = cache.get(key);
  if (memo) return memo;

  const slug = punditSlug(name);

  let row = await prisma.pundit.findUnique({
    where: { slug },
    select: { id: true, excluded: true },
  });

  // Alias path: the article printed "Sonnen", the row is "chael-sonnen".
  if (!row) {
    const byAlias = await prisma.pundit.findFirst({
      where: { aliases: { hasSome: [name.trim(), key] } },
      select: { id: true, excluded: true },
    });
    if (byAlias) row = byAlias;
  }

  if (!row) {
    // Unknown voice — auto-create with the LLM-classified role. Race-safe:
    // a concurrent create wins the unique slug and we re-read it.
    try {
      row = await prisma.pundit.create({
        data: { name: name.trim(), slug, role: normalizeRole(role), aliases: [] },
        select: { id: true, excluded: true },
      });
    } catch {
      row = await prisma.pundit.findUnique({
        where: { slug },
        select: { id: true, excluded: true },
      });
    }
  }

  if (row) cache.set(key, row);
  return row;
}
