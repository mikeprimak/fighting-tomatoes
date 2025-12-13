/**
 * Heatmap color utilities for fight hype and rating scores
 * Pre-computed lookup tables for 0.0 to 10.0 in 0.1 increments
 *
 * HYPE Color Scale (Orange → Red) - Warm, energetic excitement:
 * - 0-0.9: Grey (#808080)
 * - 1-5: Grey to orange
 * - 5-7: Orange intensifies
 * - 7-10: Orange to deep red
 *
 * RATING Color Scale (Blue → Purple) - Cool, analytical judgment:
 * - 0-0.9: Grey (#808080)
 * - 1-5: Grey to blue
 * - 5-7: Blue to indigo
 * - 7-10: Indigo to magenta-purple
 */

// HYPE color stops (Orange → Red)
const hypeColorStops = [
  { score: 1.0, r: 128, g: 128, b: 128 },  // Grey
  { score: 3.0, r: 180, g: 120, b: 80 },   // Muted orange-brown
  { score: 5.0, r: 230, g: 130, b: 60 },   // Orange
  { score: 7.0, r: 249, g: 115, b: 22 },   // Bright orange #F97316
  { score: 8.0, r: 239, g: 68, b: 68 },    // Red-orange #EF4444
  { score: 9.0, r: 220, g: 38, b: 38 },    // Red #DC2626
  { score: 10.0, r: 185, g: 28, b: 28 },   // Deep red #B91C1C
];

// RATING color stops (Blue → Purple)
const ratingColorStops = [
  { score: 1.0, r: 128, g: 128, b: 128 },  // Grey
  { score: 3.0, r: 100, g: 130, b: 180 },  // Muted blue
  { score: 5.0, r: 59, g: 130, b: 246 },   // Blue #3B82F6
  { score: 7.0, r: 99, g: 102, b: 241 },   // Indigo #6366F1
  { score: 8.0, r: 139, g: 92, b: 246 },   // Violet #8B5CF6
  { score: 9.0, r: 168, g: 85, b: 247 },   // Purple #A855F7
  { score: 10.0, r: 192, g: 38, b: 211 },  // Magenta-purple #C026D3
];

// Color stop type
type ColorStop = { score: number; r: number; g: number; b: number };

// Interpolate between two color stops for a given color scale
function interpolateColor(score: number, colorStops: ColorStop[]): string {
  let lowerStop = colorStops[0];
  let upperStop = colorStops[colorStops.length - 1];

  for (let i = 0; i < colorStops.length - 1; i++) {
    if (score >= colorStops[i].score && score <= colorStops[i + 1].score) {
      lowerStop = colorStops[i];
      upperStop = colorStops[i + 1];
      break;
    }
  }

  const range = upperStop.score - lowerStop.score;
  const t = (score - lowerStop.score) / range;

  const r = Math.round(lowerStop.r + (upperStop.r - lowerStop.r) * t);
  const g = Math.round(lowerStop.g + (upperStop.g - lowerStop.g) * t);
  const b = Math.round(lowerStop.b + (upperStop.b - lowerStop.b) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

// Pre-compute all 101 HYPE colors (0.0 to 10.0 in 0.1 increments)
// Orange → Red scale for excitement/anticipation
const HYPE_COLORS: string[] = [];
for (let i = 0; i <= 100; i++) {
  const score = i / 10;
  if (score < 1) {
    HYPE_COLORS.push('#808080'); // Grey for scores below 1
  } else if (score >= 10) {
    HYPE_COLORS.push('rgb(185, 28, 28)'); // Deep red for 10
  } else {
    HYPE_COLORS.push(interpolateColor(score, hypeColorStops));
  }
}

// Pre-compute all 101 RATING colors (0.0 to 10.0 in 0.1 increments)
// Blue → Purple scale for analytical judgment
const RATING_COLORS: string[] = [];
for (let i = 0; i <= 100; i++) {
  const score = i / 10;
  if (score < 1) {
    RATING_COLORS.push('#808080'); // Grey for scores below 1
  } else if (score >= 10) {
    RATING_COLORS.push('rgb(192, 38, 211)'); // Magenta-purple for 10
  } else {
    RATING_COLORS.push(interpolateColor(score, ratingColorStops));
  }
}

/**
 * Get heatmap color for a HYPE score (0-10)
 * Orange → Red scale for excitement/anticipation
 * Uses pre-computed lookup table for O(1) performance
 */
export const getHypeHeatmapColor = (hypeScore: number): string => {
  // Clamp to valid range
  if (hypeScore < 0) return HYPE_COLORS[0];
  if (hypeScore >= 10) return HYPE_COLORS[100];

  // Round to nearest 0.1 and lookup
  const index = Math.round(hypeScore * 10);
  return HYPE_COLORS[index];
};

/**
 * Get heatmap color for a RATING score (0-10)
 * Blue → Purple scale for analytical judgment
 * Uses pre-computed lookup table for O(1) performance
 */
export const getRatingHeatmapColor = (ratingScore: number): string => {
  // Clamp to valid range
  if (ratingScore < 0) return RATING_COLORS[0];
  if (ratingScore >= 10) return RATING_COLORS[100];

  // Round to nearest 0.1 and lookup
  const index = Math.round(ratingScore * 10);
  return RATING_COLORS[index];
};

// Pre-computed RGB values for faster color mixing
// Parsed once at module load
interface RGBColor {
  r: number;
  g: number;
  b: number;
}

// Helper to parse color string to RGB
function colorToRGB(color: string): RGBColor {
  if (color.startsWith('#')) {
    return {
      r: parseInt(color.slice(1, 3), 16),
      g: parseInt(color.slice(3, 5), 16),
      b: parseInt(color.slice(5, 7), 16),
    };
  }
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
    };
  }
  return { r: 128, g: 128, b: 128 }; // Fallback grey
}

// Pre-computed HYPE RGB values
const HYPE_RGB: RGBColor[] = HYPE_COLORS.map(colorToRGB);

// Pre-computed RATING RGB values
const RATING_RGB: RGBColor[] = RATING_COLORS.map(colorToRGB);

// Common background colors pre-parsed
const BACKGROUND_RGB: Record<string, RGBColor> = {
  '#000000': { r: 0, g: 0, b: 0 },
  '#ffffff': { r: 255, g: 255, b: 255 },
  '#121212': { r: 18, g: 18, b: 18 },  // Common dark mode background
  '#1a1a1a': { r: 26, g: 26, b: 26 },
  '#f5f5f5': { r: 245, g: 245, b: 245 },
};

/**
 * Parse a color string to RGB values
 * Cached for common colors, parsed on-demand for others
 */
function parseColor(color: string): RGBColor {
  const cached = BACKGROUND_RGB[color.toLowerCase()];
  if (cached) return cached;

  // Parse hex
  const hexMatch = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hexMatch) {
    const rgb = {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
    // Cache for future lookups
    BACKGROUND_RGB[color.toLowerCase()] = rgb;
    return rgb;
  }

  // Parse rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }

  return { r: 128, g: 128, b: 128 }; // Fallback grey
}

/**
 * Mix 70% heatmap color with 30% background color for flame icon
 * Optimized version using pre-parsed RGB values
 */
export const getFlameColor = (hypeColor: string, bgColor: string): string => {
  const hypeRgb = parseColor(hypeColor);
  const bgRgb = parseColor(bgColor);

  const r = Math.round(hypeRgb.r * 0.7 + bgRgb.r * 0.3);
  const g = Math.round(hypeRgb.g * 0.7 + bgRgb.g * 0.3);
  const b = Math.round(hypeRgb.b * 0.7 + bgRgb.b * 0.3);

  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Get flame color directly from a hype score
 * Most efficient: uses pre-computed RGB lookup + cached background parsing
 */
export const getFlameColorFromScore = (hypeScore: number, bgColor: string): string => {
  // Get pre-computed RGB for this score
  const index = Math.max(0, Math.min(100, Math.round(hypeScore * 10)));
  const hypeRgb = HYPE_RGB[index];
  const bgRgb = parseColor(bgColor);

  const r = Math.round(hypeRgb.r * 0.7 + bgRgb.r * 0.3);
  const g = Math.round(hypeRgb.g * 0.7 + bgRgb.g * 0.3);
  const b = Math.round(hypeRgb.b * 0.7 + bgRgb.b * 0.3);

  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Get rating icon color directly from a rating score
 * Blue → Purple scale mixed with background for icons
 */
export const getRatingColorFromScore = (ratingScore: number, bgColor: string): string => {
  // Get pre-computed RGB for this score
  const index = Math.max(0, Math.min(100, Math.round(ratingScore * 10)));
  const ratingRgb = RATING_RGB[index];
  const bgRgb = parseColor(bgColor);

  const r = Math.round(ratingRgb.r * 0.7 + bgRgb.r * 0.3);
  const g = Math.round(ratingRgb.g * 0.7 + bgRgb.g * 0.3);
  const b = Math.round(ratingRgb.b * 0.7 + bgRgb.b * 0.3);

  return `rgb(${r}, ${g}, ${b})`;
};
