import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

/**
 * Film grain over the whole video. A flat digital #181818 is the single
 * biggest "made in CSS" tell; ~5% animated noise reads as footage.
 *
 * One small SVG turbulence tile, repeated — cheap for Chrome to composite.
 * The tile itself is static; the texture is animated by jumping the tile
 * offset every frame (deterministic in the frame number, so renders are
 * reproducible). Real grain never sits still, and a static overlay reads as
 * a dirty screen instead.
 */
const TILE = 240;

const GRAIN_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}">` +
      `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
      `<feColorMatrix type="saturate" values="0"/></filter>` +
      `<rect width="${TILE}" height="${TILE}" filter="url(#n)"/></svg>`,
  );

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const frame = useCurrentFrame();
  // Large co-prime multipliers so consecutive frames land far apart in the tile.
  const jx = (frame * 131) % TILE;
  const jy = (frame * 197) % TILE;

  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url("${GRAIN_URI}")`,
        backgroundRepeat: 'repeat',
        backgroundPosition: `${jx}px ${jy}px`,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};
