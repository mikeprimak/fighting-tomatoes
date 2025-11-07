/**
 * Heatmap color utility for fight hype scores
 * Returns a color based on a 0-10 scale:
 * - 1-4: Gradient from grey to the color at 5
 * - 5-7.0: Gradient to golden yellow (#ffcf3b)
 * - 7.0: #ffcf3b (golden yellow)
 * - 7.5: #fdc70c (yellow-orange)
 * - 8.0: #f3903f (orange)
 * - 8.5: #ed683c (orange-red)
 * - 9.0: #e93e3a (red-orange)
 * - 10.0: #ff0000 (pure red)
 * - Smooth blending between all stops
 */
export const getHypeHeatmapColor = (hypeScore: number): string => {
  // Below 1: completely grey
  if (hypeScore < 1) return '#808080';

  // Define color stops - now starting from 1
  const colorStops = [
    { score: 1.0, color: { r: 128, g: 128, b: 128 } },  // Grey
    { score: 5.0, color: { r: 200, g: 185, b: 130 } },  // Muted yellowish (gradient transition point)
    { score: 7.0, color: { r: 255, g: 207, b: 59 } },   // #ffcf3b - golden yellow
    { score: 7.5, color: { r: 253, g: 183, b: 12 } },   // Adjusted yellow-orange
    { score: 8.0, color: { r: 243, g: 134, b: 53 } },   // Adjusted orange
    { score: 8.5, color: { r: 237, g: 94, b: 50 } },    // Adjusted orange-red
    { score: 9.0, color: { r: 233, g: 52, b: 48 } },    // Adjusted red-orange
    { score: 10.0, color: { r: 255, g: 0, b: 0 } },     // #ff0000 - pure red
  ];

  // Find the two color stops to interpolate between
  let lowerStop = colorStops[0];
  let upperStop = colorStops[colorStops.length - 1];

  for (let i = 0; i < colorStops.length - 1; i++) {
    if (hypeScore >= colorStops[i].score && hypeScore <= colorStops[i + 1].score) {
      lowerStop = colorStops[i];
      upperStop = colorStops[i + 1];
      break;
    }
  }

  // If score is exactly at or above 10, return pure red
  if (hypeScore >= 10.0) {
    return '#ff0000';
  }

  // Linear interpolation between the two stops
  const range = upperStop.score - lowerStop.score;
  const t = (hypeScore - lowerStop.score) / range;

  const r = Math.round(lowerStop.color.r + (upperStop.color.r - lowerStop.color.r) * t);
  const g = Math.round(lowerStop.color.g + (upperStop.color.g - lowerStop.color.g) * t);
  const b = Math.round(lowerStop.color.b + (upperStop.color.b - lowerStop.color.b) * t);

  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Mix 70% heatmap color with 30% background color for flame icon
 * This creates a semi-transparent effect that works on any background
 */
export const getFlameColor = (hypeColor: string, bgColor: string): string => {
  // Parse hype color (RGB or hex)
  const hypeRgbaMatch = hypeColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  const hypeHexMatch = hypeColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

  let hypeR = 0, hypeG = 0, hypeB = 0;
  if (hypeRgbaMatch) {
    hypeR = parseInt(hypeRgbaMatch[1]);
    hypeG = parseInt(hypeRgbaMatch[2]);
    hypeB = parseInt(hypeRgbaMatch[3]);
  } else if (hypeHexMatch) {
    hypeR = parseInt(hypeHexMatch[1], 16);
    hypeG = parseInt(hypeHexMatch[2], 16);
    hypeB = parseInt(hypeHexMatch[3], 16);
  }

  // Parse background color (RGB or hex)
  const bgRgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  const bgHexMatch = bgColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

  let bgR = 0, bgG = 0, bgB = 0;
  if (bgRgbaMatch) {
    bgR = parseInt(bgRgbaMatch[1]);
    bgG = parseInt(bgRgbaMatch[2]);
    bgB = parseInt(bgRgbaMatch[3]);
  } else if (bgHexMatch) {
    bgR = parseInt(bgHexMatch[1], 16);
    bgG = parseInt(bgHexMatch[2], 16);
    bgB = parseInt(bgHexMatch[3], 16);
  }

  // Mix 70% hype + 30% background
  const mixedR = Math.round(hypeR * 0.7 + bgR * 0.3);
  const mixedG = Math.round(hypeG * 0.7 + bgG * 0.3);
  const mixedB = Math.round(hypeB * 0.7 + bgB * 0.3);

  return `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
};
