import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';
import { COLORS, SHEAR } from '../brand';
import { heatmapColor, heatmapOnBg } from '../heatmap';
import { StarIcon } from './StarIcon';

/**
 * ① Number Pop — the signature beat. Every rating number does this.
 * Spec §9.4: scale 0.6 -> 1.10 gentle overshoot -> 1.0 settle, alpha in over ~5 frames.
 *
 * The heatmap lives in the STAR, not the digits: a big heatmap star pops in behind the
 * number (the Rate This Fight modal's star, scaled up) and the number itself is always
 * white with a dark shadow — the app's own convention for score text sitting on a heatmap
 * fill, and it holds contrast at every score, where a heatmap 9.0 on a heatmap star sat
 * red-on-red. The glow halo stays heatmap-coloured, so a white number glows its own score.
 *
 * One decimal place, always. Two decimals reads like a spreadsheet, and the extra digit
 * is noise at 260px.
 *
 * The glow halo is a blurred duplicate underneath (Remotion/CSS has no native glow that
 * matches the OpenShot trick, so we render the same text twice).
 */
export const NumberPop: React.FC<{
  value: number;
  startFrame?: number;
  fontSize?: number;
  blurAmount?: number; // used by BlurReveal for the hook + #1 payoff
  showStar?: boolean;
}> = ({ value, startFrame = 0, fontSize = 260, blurAmount = 0, showStar = true }) => {
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

  // The star pops on the same beat, a touch deeper and a touch slower so it reads as a
  // backdrop landing rather than a second competing object.
  const starScale = interpolate(frame, [0, 11, 17], [0.35, 1.08, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });

  const text = value.toFixed(1);
  const heat = heatmapColor(value);
  // White digits don't need the fill muted under them, so the star sits close to full
  // strength — the heatmap is the thing carrying the score's colour now.
  const starMix = 0.62;
  // Big enough that the star's points clear the digits — at 1.5x the number swallowed it
  // and the star read as a smudge behind the score.
  const starSize = Math.round(fontSize * 1.9);
  const blur = blurAmount ? `blur(${blurAmount}px)` : undefined;

  const base: React.CSSProperties = {
    fontFamily: 'Anton, sans-serif',
    fontSize,
    color: COLORS.white,
    transform: `${SHEAR} scale(${scale})`,
    lineHeight: 1,
    letterSpacing: '-0.02em',
  };

  const height = showStar ? starSize : fontSize;

  return (
    <div
      style={{
        position: 'relative',
        opacity,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {showStar && (
        <div
          style={{
            position: 'absolute',
            transform: `scale(${starScale})`,
            filter: blur,
          }}
        >
          <StarIcon
            size={starSize}
            fill={heatmapOnBg(value, starMix)}
            stroke={heat}
            strokeWidth={0.6}
          />
        </div>
      )}

      {/* glow halo: blurred, slightly larger duplicate sitting behind the digits.
          Always the heatmap colour, so white payoff digits still glow red. */}
      <div
        style={{
          ...base,
          color: heat,
          position: 'absolute',
          filter: `blur(18px) ${blur ?? ''}`,
          transform: `${SHEAR} scale(${scale * 1.05})`,
          opacity: 0.55,
        }}
      >
        {text}
      </div>

      <div
        style={{
          ...base,
          position: 'absolute',
          filter: blur,
          textShadow: '0 4px 18px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.75)',
        }}
      >
        {text}
      </div>
    </div>
  );
};
