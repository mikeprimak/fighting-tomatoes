import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_SHOWN = 'spoilerOnboarding:shown';

export async function shouldShowSpoilerOnboarding(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY_SHOWN)) !== '1';
}

export async function markSpoilerOnboardingShown(): Promise<void> {
  await AsyncStorage.setItem(KEY_SHOWN, '1');
}

export async function __resetSpoilerOnboardingForDev(): Promise<void> {
  await AsyncStorage.removeItem(KEY_SHOWN);
}
