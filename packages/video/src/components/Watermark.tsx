import React from 'react';
import { staticFile, Img } from 'remotion';
import { SAFE } from '../brand';

/**
 * ⑤ Watermark bug — hand PNG, top-LEFT inside the safe zone, alpha 0.6.
 * Present on every beat except the outro, where the full lockup takes over.
 * Keeps the brand on the frame if a clip gets re-shared.
 */
export const Watermark: React.FC = () => (
  <Img
    src={staticFile('brand/hand.png')}
    style={{
      position: 'absolute',
      top: SAFE.top,
      left: SAFE.left,
      width: 110,
      opacity: 0.6,
    }}
  />
);
