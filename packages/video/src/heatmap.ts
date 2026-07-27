/**
 * Rating heatmap — the SAME scale the app uses on every score surface.
 * Ported verbatim from packages/web/src/utils/heatmap.ts (itself a port of
 * packages/mobile/utils/heatmap.ts). Keep the stops in sync: a video that colours
 * a 9.2 differently than the app does is an off-brand video.
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

export const heatmapColor = (score: number): string => {
  if (score < 0) return HEATMAP_COLORS[0];
  if (score >= 10) return HEATMAP_COLORS[100];
  return HEATMAP_COLORS[Math.round(score * 10)];
};

/** Same colour, pushed toward the video background — for fills sitting behind text. */
export const heatmapOnBg = (score: number, mix = 0.34): string => {
  const m = heatmapColor(score).match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#808080';
  const bg = { r: 0x18, g: 0x18, b: 0x18 };
  const r = Math.round(Number(m[1]) * mix + bg.r * (1 - mix));
  const g = Math.round(Number(m[2]) * mix + bg.g * (1 - mix));
  const b = Math.round(Number(m[3]) * mix + bg.b * (1 - mix));
  return `rgb(${r}, ${g}, ${b})`;
};
