/**
 * Format a weight-class enum for display.
 *   "WELTERWEIGHT"        -> "Welterweight"
 *   "WOMENS_STRAWWEIGHT"  -> "Women's Strawweight"
 *   "WOMEN'S STRAWWEIGHT" -> "Women's Strawweight"
 */
export function formatWeightClass(wc?: string | null): string | null {
  if (!wc) return null;
  return wc
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bWomens\b/g, "Women's")
    .replace(/Women'S\b/g, "Women's");
}
