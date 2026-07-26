import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';
import { COLORS } from '../brand';

/**
 * ③ Rating Bar fill — data-viz, cheap + premium.
 * Spec §9.4: anchored left, scaleX 0 -> rating/10 over ~0.5s, eased, on a faint rail.
 */
export const RatingBar: React.FC<{
  rating: number;
  startFrame?: number;
  width?: number;
}> = ({ rating, startFrame = 0, width = 620 }) => {
  const frame = useCurrentFrame() - startFrame;
  const target = Math.max(0, Math.min(1, rating / 10));

  const fill = interpolate(frame, [0, 15], [0, target], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });

  return (
    <div
      style={{
        width,
        height: 12,
        backgroundColor: COLORS.panel,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: COLORS.gold,
          borderRadius: 6,
          transform: `scaleX(${fill})`,
          transformOrigin: 'left center',
        }}
      />
    </div>
  );
};
