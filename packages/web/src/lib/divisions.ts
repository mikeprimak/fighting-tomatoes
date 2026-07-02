/**
 * WeightClass enum ↔ URL slug ↔ human label mapping for the /fighters division
 * hub pages (programmatic-SEO step 4). The slug is a pure mechanical transform
 * of the Prisma enum (LIGHT_HEAVYWEIGHT ↔ light-heavyweight), so no hand-kept
 * list can drift out of sync with the schema — any enum value round-trips.
 */

/**
 * Divisions with fewer indexable fighters than this stay unlinked from the hub
 * and emit noindex on their facet page (thin-page guard, same philosophy as the
 * sitemap gate).
 */
export const MIN_DIVISION_COUNT = 3;

/** LIGHT_HEAVYWEIGHT -> light-heavyweight */
export function divisionSlug(weightClass: string): string {
  return weightClass.toLowerCase().replace(/_/g, '-');
}

/** light-heavyweight -> LIGHT_HEAVYWEIGHT (validated against the enum by the API). */
export function divisionEnum(slug: string): string {
  return slug.toUpperCase().replace(/-/g, '_');
}

/** BOXING_SUPER_FLYWEIGHT -> "Super Flyweight (Boxing)"; WOMENS_STRAWWEIGHT -> "Women's Strawweight" */
export function divisionLabel(weightClass: string): string {
  let wc = weightClass;
  let suffix = '';
  if (wc.startsWith('BOXING_')) {
    wc = wc.slice('BOXING_'.length);
    suffix = ' (Boxing)';
  }
  const words = wc
    .split('_')
    .map((w) => (w === 'WOMENS' ? "Women's" : w[0] + w.slice(1).toLowerCase()));
  return words.join(' ') + suffix;
}
