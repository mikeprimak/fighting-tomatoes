// @ts-nocheck — STAGED FILE: the native deps below aren't installed yet, so
// type-checking is disabled here until they land in the next build (see notes).
// ⚠️ STAGED — NOT YET WIRED. Do NOT import this file until the native deps are
// installed and a new build is cut. It is intentionally left unreferenced so
// Metro never resolves the native modules below — importing it before the deps
// exist would break the JS bundle and every OTA.
//
// ── To turn this on (during the NEXT iOS+Android build) ──────────────────────
// 1. Install the native deps (need a build; can't OTA):
//      pnpm --filter mobile add react-native-view-shot react-native-share
//    (react-native-share is used instead of expo-sharing because it can attach
//     the image AND a message AND the link in one share sheet; expo-sharing
//     shares a bare file only.)
// 2. In HypeRevealModal / RatingRevealModal, change the Share button's
//    onPress from shareFightLink(...) to:
//      captureAndShareCard(cardRef, { fight, variant, value })
//    (cardRef is already wired to <ShareableFightCard ref={cardRef} ...>).
// 3. Keep shareFightLink as the fallback (see below) for when capture fails.
// 4. Fold the Android /fights App Link intent-filter into the SAME build (see
//    docs / the open-in-app work) so this build covers both.
//
// Until then, the live app keeps using shareFightLink() (link + web OG image).

import { captureRef } from 'react-native-view-shot';
import Share from 'react-native-share';
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
// or sharing fails (caller should fall back to shareFightLink()).
export async function captureAndShareCard(
  cardRef: RefObject<View>,
  { fight, variant, value }: CaptureShareArgs,
): Promise<boolean> {
  if (!cardRef.current) return false;
  try {
    const uri = await captureRef(cardRef, {
      format: 'png',
      quality: 1,
      // pixelRatio bumps the export resolution so the shared image is crisp.
      // @ts-expect-error pixelRatio is supported at runtime by view-shot
      pixelRatio: 3,
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

    await Share.open({
      url: uri.startsWith('file://') ? uri : `file://${uri}`,
      message,
      type: 'image/png',
      failOnCancel: false,
    });
    return true;
  } catch {
    return false;
  }
}
