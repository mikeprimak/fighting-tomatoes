/**
 * SEO slug helpers for canonical goodfights.app URLs (fighter/event/fight pages).
 * See docs/plans/programmatic-seo-2026-07-01.md.
 *
 * `slugify` is deterministic and ASCII-only so the same input always yields the
 * same URL segment (safe to re-run in the backfill and at row-write time).
 * Uniqueness against existing rows is enforced separately by the caller via
 * `ensureUniqueSlug` — the DB has a UNIQUE index on each slug column as the hard
 * backstop.
 */

/** Lowercase, ASCII-fold (strip diacritics), drop apostrophes, hyphenate. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics (accents)
    .replace(/['’.]/g, '') // drop apostrophes/periods (O'Malley -> omalley)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics -> single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

export function fighterSlugBase(f: { firstName: string; lastName: string }): string {
  return slugify(`${f.firstName} ${f.lastName}`) || 'fighter';
}

export function eventSlugBase(e: { name: string }): string {
  return slugify(e.name) || 'event';
}

export function fightSlugBase(f: {
  fighter1: { firstName: string; lastName: string };
  fighter2: { firstName: string; lastName: string };
}): string {
  const a = slugify(`${f.fighter1.firstName} ${f.fighter1.lastName}`);
  const b = slugify(`${f.fighter2.firstName} ${f.fighter2.lastName}`);
  const base = [a, b].filter(Boolean).join('-vs-');
  return base || 'fight';
}

/**
 * Given a base slug and a set of slugs already taken, return a unique slug by
 * appending -2, -3, … on collision. Mutates `taken` to include the returned slug
 * so sequential callers stay consistent.
 */
export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  const unique = `${base}-${n}`;
  taken.add(unique);
  return unique;
}
