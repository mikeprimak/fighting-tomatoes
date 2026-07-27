import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';
import { StarIcon } from './StarIcon';
import { heatmapColor } from '../heatmap';

/**
 * ③ Ten stars — the app's rating row, not a generic progress bar.
 *
 * Mirrors the Rate This Fight modal: ten stars, star N filled with the heatmap colour
 * of score N, unfilled stars are grey outlines. Fills left-to-right over ~0.5s on the
 * one easing. The fill is CLIPPED, not rounded, so a 9.7 shows seven tenths of the
 * tenth star — the row never rounds a score up for the sake of a tidy shape.
 */
export const StarRow: React.FC<{
  rating: number;
  startFrame?: number;
  size?: number;
  gap?: number;
}> = ({ rating, startFrame = 0, size = 58, gap = 10 }) => {
  const frame = useCurrentFrame() - startFrame;
  const target = Math.max(0, Math.min(1, rating / 10));

  const fill = interpolate(frame, [0, 15], [0, target], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });

  const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const totalWidth = size * 10 + gap * 9;
  const row: React.CSSProperties = { display: 'flex', gap, width: totalWidth };

  return (
    <div style={{ position: 'relative', width: totalWidth, height: size }}>
      {/* rail: empty outlines */}
      <div style={row}>
        {levels.map((n) => (
          <StarIcon key={n} size={size} fill="transparent" stroke="#808080" strokeWidth={1.5} />
        ))}
      </div>

      {/* fill: clipped from the left, each star in its own heatmap colour */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: size,
          width: totalWidth * fill,
          overflow: 'hidden',
        }}
      >
        <div style={row}>
          {levels.map((n) => {
            const c = heatmapColor(n);
            return <StarIcon key={n} size={size} fill={c} stroke={c} strokeWidth={1.5} />;
          })}
        </div>
      </div>
    </div>
  );
};
