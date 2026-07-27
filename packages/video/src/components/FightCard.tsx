import React from 'react';
import { interpolate, useCurrentFrame, Easing, Img, staticFile } from 'remotion';
import { COLORS, SHEAR, SAFE } from '../brand';
import { NumberPop } from './NumberPop';
import { StarRow } from './StarRow';
import type { VideoFight } from '../data/types';

const Headshot: React.FC<{ src: string | null; name: string; delay: number; from: number }> = ({
  src,
  name,
  delay,
  from,
}) => {
  const frame = useCurrentFrame() - delay;
  const x = interpolate(frame, [0, 14], [from, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ transform: `translateX(${x}px)`, opacity, textAlign: 'center' }}>
      <div
        style={{
          width: 300,
          height: 300,
          borderRadius: 16,
          backgroundColor: COLORS.panel,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        {src ? (
          <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ color: COLORS.gray, fontSize: 28, fontFamily: 'Inter, sans-serif', alignSelf: 'center' }}>
            {name}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * One countdown card (~10s). Spec §9.5: headshots slide in, names slide, event in gray,
 * rating bar fills, number pops, one visceral caption line.
 */
export const FightCard: React.FC<{ fight: VideoFight; caption: string; total: number }> = ({
  fight,
  caption,
  total,
}) => {
  const frame = useCurrentFrame();

  const nameOpacity = interpolate(frame, [10, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const nameY = interpolate(frame, [10, 22], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });

  const captionOpacity = interpolate(frame, [45, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: SAFE.top,
        // Content is centred in the remaining box. A full SAFE.bottom reserve here
        // pushes everything into the top third and leaves the frame bottom-empty,
        // so reserve less: nothing critical lands below ~1500px anyway.
        paddingBottom: 300,
        paddingLeft: SAFE.left,
        paddingRight: SAFE.right,
      }}
    >
      {/* rank label */}
      <div
        style={{
          fontFamily: 'Anton, sans-serif',
          fontSize: 52,
          color: COLORS.gold,
          transform: SHEAR,
          opacity: nameOpacity,
          letterSpacing: '0.04em',
          marginBottom: 28,
        }}
      >
        #{fight.rank} of {total}
      </div>

      {/* headshots */}
      <div style={{ display: 'flex', gap: 28, alignItems: 'center', marginBottom: 32 }}>
        <Headshot src={fight.fighter1.headshot} name={fight.fighter1.lastName} delay={0} from={-260} />
        <div
          style={{
            fontFamily: 'Anton, sans-serif',
            fontSize: 46,
            color: COLORS.red,
            transform: SHEAR,
            opacity: nameOpacity,
          }}
        >
          VS
        </div>
        <Headshot src={fight.fighter2.headshot} name={fight.fighter2.lastName} delay={0} from={260} />
      </div>

      {/* names */}
      <div
        style={{
          opacity: nameOpacity,
          transform: `translateY(${nameY}px)`,
          textAlign: 'center',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: 'Anton, sans-serif',
            fontSize: 76,
            color: COLORS.white,
            transform: SHEAR,
            lineHeight: 1.05,
          }}
        >
          {fight.fighter1.lastName.toUpperCase()} vs {fight.fighter2.lastName.toUpperCase()}
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 30,
            color: COLORS.gray,
            marginTop: 12,
          }}
        >
          {/* Event + date only. The finish is the caption's job (see captionFor) — it was
              printing here AND in the fallback caption, stating the outcome twice. */}
          {fight.event} · {fight.eventDateLabel}
        </div>
      </div>

      {/* the star: rating number on its heatmap star + ten stars + honest vote count */}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <NumberPop value={fight.rating} startFrame={26} fontSize={230} />
        <div style={{ marginTop: 6 }}>
          <StarRow rating={fight.rating} startFrame={30} />
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 28,
            color: COLORS.gray,
            marginTop: 16,
          }}
        >
          {fight.votes} fans rated it
        </div>
      </div>

      {/* one visceral line */}
      <div
        style={{
          opacity: captionOpacity,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          fontSize: 38,
          color: COLORS.white,
          textAlign: 'center',
          marginTop: 34,
          maxWidth: 820,
          lineHeight: 1.3,
        }}
      >
        {caption}
      </div>
    </div>
  );
};
