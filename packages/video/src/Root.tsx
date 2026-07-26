import React from 'react';
import { Composition } from 'remotion';
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { Countdown, countdownDuration } from './Countdown';
import { VIDEO } from './brand';
import { CAPTIONS } from './data/captions';
import topFights from './data/top-fights.json';
import type { VideoPayload } from './data/types';

// Fonts must be loaded at module scope so every frame renders with them available.
loadAnton();
loadInter();

const payload = topFights as VideoPayload;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Countdown"
      component={Countdown}
      durationInFrames={countdownDuration(payload.fights.length)}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
      defaultProps={{ payload, captions: CAPTIONS }}
    />
  </>
);
