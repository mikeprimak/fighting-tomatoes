/**
 * Promotion-specific default event banner images.
 *
 * When a scraped event has no banner image, the app shows the default
 * banner for that promotion instead of a generic placeholder.
 *
 * To add/replace a default banner for a promotion:
 *   1. Place the image in packages/mobile/assets/events/defaults/
 *   2. Add or update the require() entry below
 *   3. Recommended size: 1200x675 (16:9 aspect ratio)
 */

const PROMOTION_BANNERS: Record<string, any> = {
  // Add promotion-specific default banners here as images become available:
  // 'UFC': require('../assets/events/defaults/ufc-default.jpg'),
  // 'ONE': require('../assets/events/defaults/one-default.jpg'),
  // 'PFL': require('../assets/events/defaults/pfl-default.jpg'),
  // 'OKTAGON': require('../assets/events/defaults/oktagon-default.jpg'),
  // 'RIZIN': require('../assets/events/defaults/rizin-default.jpg'),
  // 'ZUFFA BOXING': require('../assets/events/defaults/zuffa-boxing-default.jpg'),
  // 'MATCHROOM': require('../assets/events/defaults/matchroom-default.jpg'),
  // 'BKFC': require('../assets/events/defaults/bkfc-default.jpg'),
  // 'TOP RANK': require('../assets/events/defaults/top-rank-default.jpg'),
  // 'GOLDEN BOY': require('../assets/events/defaults/golden-boy-default.jpg'),
  // 'DIRTY BOXING': require('../assets/events/defaults/dirty-boxing-default.jpg'),
  // 'KARATE COMBAT': require('../assets/events/defaults/karate-combat-default.jpg'),
};

/**
 * Get the default banner image for a promotion.
 * Returns a require() source if a default exists, or null if not.
 */
export function getDefaultBanner(promotion: string): any | null {
  return PROMOTION_BANNERS[promotion?.toUpperCase()] || PROMOTION_BANNERS[promotion] || null;
}
