/**
 * Heatmap color utility for fight hype/rating scores
 * Ported from packages/mobile/utils/heatmap.ts
 */

const colorStops = [
  { score: 1.0, r: 128, g: 128, b: 128 },
  { score: 5.0, r: 200, g: 185, b: 130 },
  { score: 7.0, r: 255, g: 207, b: 59 },
  { score: 7.5, r: 253, g: 183, b: 12 },
  { score: 8.0, r: 243, g: 134, b: 53 },
  { score: 8.5, r: 237, g: 94, b: 50 },
  { score: 9.0, r: 233, g: 52, b: 48 },
  { score: 10.0, r: 255, g: 0, b: 0 },
];

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

const HEATMAP_COLORS: string[] = [];
for (let i = 0; i <= 100; i++) {
  const score = i / 10;
  if (score < 1) {
    HEATMAP_COLORS.push('#808080');
  } else if (score >= 10) {
    HEATMAP_COLORS.push('#ff0000');
  } else {
    HEATMAP_COLORS.push(interpolateColor(score));
  }
}

export const getHypeHeatmapColor = (hypeScore: number): string => {
  if (hypeScore < 0) return HEATMAP_COLORS[0];
  if (hypeScore >= 10) return HEATMAP_COLORS[100];
  const index = Math.round(hypeScore * 10);
  return HEATMAP_COLORS[index];
};

export const getFlameColorFromScore = (hypeScore: number, bgColor: string): string => {
  const index = Math.max(0, Math.min(100, Math.round(hypeScore * 10)));
  const hypeRgb = parseColor(HEATMAP_COLORS[index]);
  const bgRgb = parseColor(bgColor);
  const r = Math.round(hypeRgb.r * 0.7 + bgRgb.r * 0.3);
  const g = Math.round(hypeRgb.g * 0.7 + bgRgb.g * 0.3);
  const b = Math.round(hypeRgb.b * 0.7 + bgRgb.b * 0.3);
  return `rgb(${r}, ${g}, ${b})`;
};

interface RGBColor { r: number; g: number; b: number }

function parseColor(color: string): RGBColor {
  const hexMatch = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hexMatch) {
    return { r: parseInt(hexMatch[1], 16), g: parseInt(hexMatch[2], 16), b: parseInt(hexMatch[3], 16) };
  }
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
  }
  return { r: 128, g: 128, b: 128 };
}
