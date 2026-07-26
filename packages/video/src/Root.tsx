import React from 'react';
import { Composition } from 'remotion';
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { Countdown, countdownDuration } from './Countdown';
import { VIDEO } from './brand';
import { CAPTIONS } from './data/captions';
// Always the most recent pull. videoData.ts writes both <format>.json (archive) and
// current.json (this). A static import can't select a file by name at render time, so
// "the last thing you pulled" is the contract — see the script's closing output.
import current from './data/current.json';
import type { VideoPayload } from './data/types';

// Fonts must be loaded at module scope so every frame renders with them available.
loadAnton();
loadInter();

const payload = current as VideoPayload;

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
