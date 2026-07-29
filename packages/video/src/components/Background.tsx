import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { COLORS } from '../brand';

/**
 * Action-photo backdrop for a fight card. The photo is atmosphere, not content:
 * heavily desaturated, dimmed to ~a quarter opacity, and scrimmed so every
 * factual element (names, score, votes) keeps full contrast against what is
 * effectively still the app's #181818. A slow push-in (Ken Burns) keeps the
 * frame alive for the whole card — a static backdrop reads as a slide, not a
 * video.
 *
 * Rights note: what goes in public/backgrounds/ is an editorial decision made
 * per file — small-org press photos and licensed/CC material first. The comp
 * treats every background as optional; a card with no photo gets AmbientGlow.
 */
export const FightBackground: React.FC<{
  src: string;
  durationInFrames: number;
  /** Heavy blur for the hook, where the photo is mood rather than subject. */
  blur?: number;
  opacity?: number;
}> = ({ src, durationInFrames, blur = 0, opacity = 0.26 }) => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, durationInFrames], [1.08, 1.18]);
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
          filter: `grayscale(0.75) contrast(1.06) brightness(0.8)${blur ? ` blur(${blur}px)` : ''}`,
          opacity: opacity * fadeIn,
        }}
      />
      {/* vignette: centre stays readable, edges melt into the brand background */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 95% 72% at 50% 42%, rgba(24,24,24,0.1) 0%, rgba(24,24,24,0.55) 62%, ${COLORS.bg} 100%)`,
        }}
      />
      {/* top/bottom bands: the safe zones carry text and platform UI — keep them darkest */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(to bottom, ${COLORS.bg} 0%, rgba(24,24,24,0) 20%, rgba(24,24,24,0) 60%, ${COLORS.bg} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * The no-photo fallback: a soft arena-light glow that drifts slowly across the
 * card. Cards without a sourced background must not read flatter than cards
 * with one — this is the floor, not a placeholder.
 */
export const AmbientGlow: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, durationInFrames], [44, 56]);
  const y = interpolate(frame, [0, durationInFrames], [40, 34]);

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle 760px at ${x}% ${y}%, rgba(245,197,24,0.07) 0%, rgba(245,197,24,0) 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle 900px at ${100 - x}% 78%, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};
