import type { RefObject } from 'react';
import type { View } from 'react-native';
import { fightShareUrl } from './shareFightCard';
import { getFighterDisplayName } from '../components/fight-cards/shared/utils';
import type { ShareCardFight } from '../components/ShareableFightCard';

interface CaptureShareArgs {
  fight: ShareCardFight;
  variant: 'hype' | 'rating';
  value: number;
}

// Snapshot the branded card view to a PNG and open the OS share sheet with the
// image + the engagement-hook message + the deep link. Returns false if capture
// or sharing fails so the caller can fall back to shareFightLink() (link only).
//
// The native modules (react-native-view-shot + react-native-share) are
// require()'d LAZILY inside try/catch. They only exist in builds that bundled
// them (vc40+). On any earlier build/OTA the require throws, we return false,
// and the caller link-shares instead — so this can never crash the live app.
export async function captureAndShareCard(
  cardRef: RefObject<View>,
  { fight, variant, value }: CaptureShareArgs,
): Promise<boolean> {
  if (!cardRef.current) return false;

  let captureRef: any;
  let RNShare: any;
  try {
    captureRef = require('react-native-view-shot').captureRef;
    RNShare = require('react-native-share').default;
  } catch {
    return false; // native modules not in this build → fall back to link share
  }

  try {
    const uri = await captureRef(cardRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });

    const f1 = getFighterDisplayName(fight.fighter1 as any);
    const f2 = getFighterDisplayName(fight.fighter2 as any);
    const url = fightShareUrl(fight.id);
    const display = Number.isInteger(value) ? `${value}` : value.toFixed(1);
    const message =
      variant === 'hype'
        ? `${f1} vs ${f2} 🔥\nMy hype: ${display}/10 — how hyped are you?\n${url}`
        : `${f1} vs ${f2} ⭐\nMy rating: ${display}/10 — what would you give it?\n${url}`;

    await RNShare.open({
      url: typeof uri === 'string' && uri.startsWith('file://') ? uri : `file://${uri}`,
      message,
      type: 'image/png',
      failOnCancel: false,
    });
    return true;
  } catch {
    return false;
  }
}
