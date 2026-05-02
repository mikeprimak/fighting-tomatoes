import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

const KEY_INSTALL_DATE = 'reviewPrompt:installDate';
const KEY_FIRST_NOTIFICATION_AT = 'reviewPrompt:firstNotificationAt';
const KEY_SHOWN = 'reviewPrompt:shown';

const MIN_INSTALL_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function seedInstallDate(): Promise<void> {
  const existing = await AsyncStorage.getItem(KEY_INSTALL_DATE);
  if (!existing) {
    await AsyncStorage.setItem(KEY_INSTALL_DATE, new Date().toISOString());
  }
}

async function isOldEnough(): Promise<boolean> {
  const iso = await AsyncStorage.getItem(KEY_INSTALL_DATE);
  if (!iso) return false;
  const installedAt = Date.parse(iso);
  if (Number.isNaN(installedAt)) return false;
  return Date.now() - installedAt >= MIN_INSTALL_AGE_MS;
}

async function alreadyShown(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY_SHOWN)) === '1';
}

export async function recordNotificationTap(): Promise<boolean> {
  const existing = await AsyncStorage.getItem(KEY_FIRST_NOTIFICATION_AT);
  if (!existing) {
    await AsyncStorage.setItem(KEY_FIRST_NOTIFICATION_AT, new Date().toISOString());
  }
  return shouldAsk();
}

export async function shouldAsk(): Promise<boolean> {
  if (await alreadyShown()) return false;
  if (!(await isOldEnough())) return false;
  const firstNotif = await AsyncStorage.getItem(KEY_FIRST_NOTIFICATION_AT);
  if (!firstNotif) return false;
  return true;
}

export async function markShown(): Promise<void> {
  await AsyncStorage.setItem(KEY_SHOWN, '1');
}

const IOS_APP_ID = '6757172609';
const ANDROID_PACKAGE = 'com.fightcrewapp.mobile';

export async function openNativeReviewSheet(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Linking.openURL(`itms-apps://itunes.apple.com/app/id${IOS_APP_ID}?action=write-review`).catch(async () => {
      await Linking.openURL(`https://apps.apple.com/app/id${IOS_APP_ID}?action=write-review`);
    });
    return;
  }
  if (Platform.OS === 'android') {
    await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`).catch(async () => {
      await Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);
    });
  }
}

export async function __resetForDev(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_INSTALL_DATE, KEY_FIRST_NOTIFICATION_AT, KEY_SHOWN]);
}
