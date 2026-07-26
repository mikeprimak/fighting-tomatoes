import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';
import { COLORS, SHEAR } from '../brand';

/**
 * ① Number Pop — the signature beat. Every rating number does this.
 * Spec §9.4: scale 0.6 -> 1.10 gentle overshoot -> 1.0 settle, alpha in over ~5 frames.
 * The glow halo is a blurred duplicate underneath (Remotion/CSS has no native glow that
 * matches the OpenShot trick, so we render the same text twice).
 */
export const NumberPop: React.FC<{
  value: number;
  startFrame?: number;
  fontSize?: number;
  blurAmount?: number; // used by BlurReveal for the hook + #1 payoff
}> = ({ value, startFrame = 0, fontSize = 300, blurAmount = 0 }) => {
  const frame = useCurrentFrame() - startFrame;

  const scale = interpolate(frame, [0, 9, 14], [0.6, 1.1, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });

  const opacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const text = value.toFixed(2);

  const base: React.CSSProperties = {
    fontFamily: 'Anton, sans-serif',
    fontSize,
    color: COLORS.gold,
    transform: `${SHEAR} scale(${scale})`,
    lineHeight: 1,
    letterSpacing: '-0.02em',
  };

  return (
    <div style={{ position: 'relative', opacity, display: 'flex', justifyContent: 'center' }}>
      {/* glow halo: blurred, slightly larger duplicate sitting behind */}
      <div
        style={{
          ...base,
          position: 'absolute',
          filter: `blur(18px) ${blurAmount ? `blur(${blurAmount}px)` : ''}`,
          transform: `${SHEAR} scale(${scale * 1.05})`,
          opacity: 0.55,
        }}
      >
        {text}
      </div>
      <div style={{ ...base, filter: blurAmount ? `blur(${blurAmount}px)` : undefined }}>{text}</div>
    </div>
  );
};
