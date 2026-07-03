import { Share, Platform } from 'react-native';
import { ShareCardFight } from '../components/ShareableFightCard';
import { getFighterDisplayName } from '../components/fight-cards/shared/utils';

// Canonical web URL for a fight. Universal Links (applinks:goodfights.app) open
// this in-app for users who have the app installed; everyone else lands on the
// web fight page, which carries the install CTA — that's the viral install loop.
export const fightShareUrl = (fightId: string) => `https://goodfights.app/fights/${fightId}`;

interface ShareArgs {
  fight: ShareCardFight;
  variant: 'hype' | 'rating';
  value: number;
}

// Phase 1 (OTA-able): share a punchy message + deep link via the built-in RN
// Share sheet — no native dependencies, ships to current users immediately.
// A later phase swaps in a captured PNG of ShareableFightCard via
// react-native-view-shot + expo-sharing (requires a new native build).
export async function shareFightLink({ fight, variant, value }: ShareArgs): Promise<boolean> {
  const f1 = getFighterDisplayName(fight.fighter1 as any);
  const f2 = getFighterDisplayName(fight.fighter2 as any);
  const url = fightShareUrl(fight.id);
  const display = Number.isInteger(value) ? `${value}` : value.toFixed(1);

  // Message text WITHOUT the URL — the link is attached differently per platform.
  const text =
    variant === 'hype'
      ? `${f1} vs ${f2} 🔥\nMy hype: ${display}/10 — how hyped are you?`
      : `${f1} vs ${f2} ⭐\nMy rating: ${display}/10 — what would you give it?`;

  try {
    const result = await Share.share(
      // On iOS, `url` is a distinct field that renders as a link preview (backed
      // by the web OG image), so the raw UUID never shows in the message body.
      // Android has no separate url field, so the link must be embedded inline.
      Platform.OS === 'ios'
        ? { message: text, url }
        : { message: `${text}\n${url}` },
      { subject: 'Good Fights' }
    );
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
