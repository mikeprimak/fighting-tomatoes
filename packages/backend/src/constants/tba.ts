/**
 * TBA (To Be Announced) Fighter Constants
 *
 * Used when a fight opponent has not yet been announced.
 * Predictions should be disabled for fights with a TBA fighter.
 */

// Global TBA fighter ID - single record used across all promotions
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
 */
export function fightHasTBA(fighter1Id: string, fighter2Id: string): boolean {
  return isTBAFighter(fighter1Id) || isTBAFighter(fighter2Id);
}
