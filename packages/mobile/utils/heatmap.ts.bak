/**
 * Heatmap color utility for fight hype/rating scores
 * Pre-computed lookup table for 0.0 to 10.0 in 0.1 increments
 *
 * Color scale:
 * - 0-0.9: Grey (#808080)
 * - 1-5: Gradient from grey to muted yellow
 * - 5-7: Gradient to golden yellow (#ffcf3b)
 * - 7-10: Gradient through orange to pure red (#ff0000)
 */

// Pre-computed color stops for interpolation
const colorStops = [
  { score: 1.0, r: 128, g: 128, b: 128 },  // Grey
  { score: 5.0, r: 200, g: 185, b: 130 },  // Muted yellowish
  { score: 7.0, r: 255, g: 207, b: 59 },   // Golden yellow
  { score: 7.5, r: 253, g: 183, b: 12 },   // Yellow-orange
  { score: 8.0, r: 243, g: 134, b: 53 },   // Orange
  { score: 8.5, r: 237, g: 94, b: 50 },    // Orange-red
  { score: 9.0, r: 233, g: 52, b: 48 },    // Red-orange
  { score: 10.0, r: 255, g: 0, b: 0 },     // Pure red
];

// Interpolate between two color stops
function interpolateColor(score: number): string {
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

// Pre-compute all 101 colors (0.0 to 10.0 in 0.1 increments)
// This runs once at module load time
const HEATMAP_COLORS: string[] = [];
for (let i = 0; i <= 100; i++) {
  const score = i / 10;
  if (score < 1) {
    HEATMAP_COLORS.push('#808080'); // Grey for scores below 1
  } else if (score >= 10) {
    HEATMAP_COLORS.push('#ff0000'); // Pure red for 10
  } else {
    HEATMAP_COLORS.push(interpolateColor(score));
  }
}

/**
 * Get heatmap color for a hype/rating score (0-10)
 * Uses pre-computed lookup table for O(1) performance
 */
export const getHypeHeatmapColor = (hypeScore: number): string => {
  // Clamp to valid range
  if (hypeScore < 0) return HEATMAP_COLORS[0];
  if (hypeScore >= 10) return HEATMAP_COLORS[100];

  // Round to nearest 0.1 and lookup
  const index = Math.round(hypeScore * 10);
  return HEATMAP_COLORS[index];
};

// Pre-computed RGB values for faster flame color mixing
// Parsed once at module load
interface RGBColor {
  r: number;
  g: number;
  b: number;
}

const HEATMAP_RGB: RGBColor[] = HEATMAP_COLORS.map(color => {
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
});

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
  const hypeRgb = HEATMAP_RGB[index];
  const bgRgb = parseColor(bgColor);

  const r = Math.round(hypeRgb.r * 0.7 + bgRgb.r * 0.3);
  const g = Math.round(hypeRgb.g * 0.7 + bgRgb.g * 0.3);
  const b = Math.round(hypeRgb.b * 0.7 + bgRgb.b * 0.3);

  return `rgb(${r}, ${g}, ${b})`;
};
