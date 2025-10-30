/**
 * Heatmap color utility for fight hype scores
 * Returns a color based on a 0-10 scale:
 * - Below 4.0: Grey (#808080)
 * - 4.0-7.0: Grey to Yellow (#fff33b) gradient
 * - 7.0: #fff33b (bright yellow)
 * - 7.5: #fdc70c (yellow-orange)
 * - 8.0: #f3903f (orange)
 * - 8.5: #ed683c (orange-red)
 * - 9.0: #e93e3a (red-orange)
 * - 10.0: #ff0000 (pure red)
 * - Smooth blending between all stops
 */
export const getHypeHeatmapColor = (hypeScore: number): string => {
  // Below 4.0: completely grey
  if (hypeScore <= 4.0) return '#808080';

  // Define color stops
  const colorStops = [
    { score: 4.0, color: { r: 128, g: 128, b: 128 } },  // Grey
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
