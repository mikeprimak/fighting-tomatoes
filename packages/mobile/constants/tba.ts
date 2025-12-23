/**
 * TBA (To Be Announced) Fighter Constants
 *
 * Used when a fight opponent has not yet been announced.
 * Predictions should be disabled for fights with a TBA fighter.
 */

// Global TBA fighter ID - matches backend constant
export const TBA_FIGHTER_ID = 'tba-fighter-global';

// TBA fighter first name for display and detection
export const TBA_FIGHTER_NAME = 'TBA';

/**
 * Check if a fighter ID is the TBA placeholder
 */
export function isTBAFighter(fighterId: string | null | undefined): boolean {
  return fighterId === TBA_FIGHTER_ID;
}

/**
 * Check if a fighter name indicates TBA
 */
export function isTBAFighterName(firstName: string | null | undefined): boolean {
  return firstName === TBA_FIGHTER_NAME || firstName === 'TBD';
}

/**
 * Check if a fight has any TBA fighter (useful for disabling predictions)
 * Can check either by fighter IDs or fighter objects with firstName
 */
export function fightHasTBA(
  fighter1: { id?: string; firstName?: string } | string,
  fighter2: { id?: string; firstName?: string } | string
): boolean {
  // Handle string IDs
  if (typeof fighter1 === 'string' && typeof fighter2 === 'string') {
    return isTBAFighter(fighter1) || isTBAFighter(fighter2);
  }

  // Handle fighter objects
  const f1 = typeof fighter1 === 'string' ? { id: fighter1 } : fighter1;
  const f2 = typeof fighter2 === 'string' ? { id: fighter2 } : fighter2;

  return (
    isTBAFighter(f1.id) ||
    isTBAFighter(f2.id) ||
    isTBAFighterName(f1.firstName) ||
    isTBAFighterName(f2.firstName)
  );
}
