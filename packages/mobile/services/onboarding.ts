/**
 * New-user onboarding flow state (identity pivot, Phase 1 objective #3).
 *
 * Mirrors spoilerOnboarding.ts: a single AsyncStorage flag. Set at successful
 * registration; the verify-email screens check it and route to
 * /(onboarding)/welcome instead of /(tabs); cleared when the user finishes or
 * skips the flow.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PENDING = 'onboarding:pending';

export async function markOnboardingPending(): Promise<void> {
  await AsyncStorage.setItem(KEY_PENDING, '1');
}

export async function isOnboardingPending(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY_PENDING)) === '1';
}

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.removeItem(KEY_PENDING);
}

export async function __resetOnboardingForDev(): Promise<void> {
  await AsyncStorage.setItem(KEY_PENDING, '1');
}
