/**
 * Utility for formatting fighter names consistently across the app.
 *
 * Handles single-name fighters (like "Tawanchai", "Rodtang") who are stored
 * with their name in lastName and empty firstName.
 */

interface FighterNameInput {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  nickname?: string | null;
}

/**
 * Formats a fighter's full display name, handling:
 * - Single-name fighters (stored in lastName with empty firstName)
 * - Two-part names (firstName + lastName)
 * - Optional nicknames
 *
 * @example
 * formatFighterName({ firstName: 'Jon', lastName: 'Jones', nickname: 'Bones' })
 * // Returns: 'Jon Jones "Bones"'
 *
 * formatFighterName({ firstName: '', lastName: 'Tawanchai' })
 * // Returns: 'Tawanchai'
 *
 * formatFighterName({ firstName: 'Israel', lastName: 'Adesanya' })
 * // Returns: 'Israel Adesanya'
 */
export function formatFighterName(fighter: FighterNameInput): string {
  const first = fighter.firstName?.trim() || '';
  const last = fighter.lastName?.trim() || '';

  // Single-name fighter (stored in lastName)
  if (!first && last) {
    return fighter.nickname ? `${last} "${fighter.nickname}"` : last;
  }

  // Single-name fighter stored in firstName (legacy data)
  if (first && !last) {
    return fighter.nickname ? `${first} "${fighter.nickname}"` : first;
  }

  // Normal two-part name
  const fullName = `${first} ${last}`.trim();
  return fighter.nickname ? `${fullName} "${fighter.nickname}"` : fullName;
}

/**
 * Gets just the display name without nickname.
 * Useful for search, sorting, or compact displays.
 */
export function getFighterDisplayName(fighter: FighterNameInput): string {
  const first = fighter.firstName?.trim() || '';
  const last = fighter.lastName?.trim() || '';

  if (!first && last) return last;
  if (first && !last) return first;
  return `${first} ${last}`.trim();
}

/**
 * Gets the primary name for sorting purposes.
 * Returns lastName for normal fighters, or the single name for single-name fighters.
 */
export function getFighterSortName(fighter: FighterNameInput): string {
  const first = fighter.firstName?.trim() || '';
  const last = fighter.lastName?.trim() || '';

  // For single-name fighters (in either field), use that name
  if (!first && last) return last.toLowerCase();
  if (first && !last) return first.toLowerCase();

  // For normal names, sort by lastName
  return last.toLowerCase();
}

/**
 * Checks if a fighter has a single-name (mononym).
 */
export function isSingleNameFighter(fighter: FighterNameInput): boolean {
  const first = fighter.firstName?.trim() || '';
  const last = fighter.lastName?.trim() || '';

  return (!first && !!last) || (!!first && !last);
}
