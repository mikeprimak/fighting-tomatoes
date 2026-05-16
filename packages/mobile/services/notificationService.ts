import { Platform, Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Check if running in Expo Go
// Push notifications ARE supported in Expo Go SDK 54+
const isExpoGo = Constants.appOwnership === 'expo';

// Lazy load Notifications to prevent initialization on import
let Notifications: any = null;
let isInitialized = false;
let tokenRegistered = false;

// Per-install cooldown so an in-app permission nudge fires at most once every 14 days.
const PERMISSION_PROMPT_KEY = '@gf/lastNotifPromptAt';
const PERMISSION_PROMPT_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
let promptInFlight = false;

function initializeNotifications() {
  if (isInitialized) return;

  Notifications = require('expo-notifications');

  // Configure how notifications are displayed when app is in foreground
  // Only show notifications that have actual content (title or body)
  Notifications.setNotificationHandler({
    handleNotification: async (notification: any) => {
      const { title, body, data } = notification.request.content;
      const trigger = notification.request.trigger;
      console.log('[Notification] Received:', JSON.stringify({ title, body, data, triggerType: trigger?.type }));
      const hasContent = !!(title || body);
      return {
        shouldShowAlert: hasContent,
        shouldPlaySound: hasContent,
        shouldSetBadge: hasContent,
        shouldShowBanner: hasContent,
        shouldShowList: hasContent,
      };
    },
  });

  // Dismiss any stale/empty notifications on startup
  Notifications.dismissAllNotificationsAsync().catch(() => {});

  isInitialized = true;
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  initializeNotifications();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

/**
 * Get Expo Push Token and register with backend
 */
export async function registerPushToken(): Promise<string | null> {
  // Only register once per app session to avoid repeated permission/token calls
  if (tokenRegistered) return null;

  try {
    // Request permissions first
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log('No notification permissions granted');
      return null;
    }

    // Lazy load apiService to avoid circular dependency
    const { apiService } = await import('./api');

    // Get push token
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: '4a64b9f8-325e-4869-ab78-9e0674d18b32',
    });

    if (token.data) {
      // Register with backend
      await apiService.registerPushToken(token.data);
      console.log('Push token registered:', token.data);
      tokenRegistered = true;
      return token.data;
    }

    return null;
  } catch (error) {
    console.error('Error registering push token:', error);
    return null;
  }
}

/**
 * Handle notification response (when user taps notification)
 */
export function addNotificationResponseListener(
  callback: (notification: any) => void
) {
  initializeNotifications();
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Handle notifications received while app is foregrounded
 */
export function addNotificationReceivedListener(
  callback: (notification: any) => void
) {
  initializeNotifications();
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Get the last notification response (for app opened via notification)
 */
export async function getLastNotificationResponseAsync() {
  initializeNotifications();
  return await Notifications.getLastNotificationResponseAsync();
}

/**
 * After a user creates a notification rule (follow fighter, follow fight, etc.),
 * verify the OS has granted push permission. If not, offer one in-app nudge —
 * cooldown-gated to at most once per 14 days per install, and only ever fires
 * after an intentional notification-setting action.
 *
 * Returns:
 *   'granted'    — permission was already granted (token re-registered if needed)
 *   'requested'  — we showed the OS prompt and user granted
 *   'denied'     — user dismissed our soft modal, or OS prompt was denied
 *   'cooldown'   — within the 14-day window since the last dismissal, silent no-op
 *   'unavailable'— Notifications module unavailable (e.g. Expo Go web)
 */
export async function ensurePushPermissionAfterAction(opts: {
  context: 'fighter-follow' | 'fight-follow';
  subject?: string;
}): Promise<'granted' | 'requested' | 'denied' | 'cooldown' | 'unavailable'> {
  if (promptInFlight) return 'cooldown';
  promptInFlight = true;
  try {
    initializeNotifications();
    if (!Notifications) return 'unavailable';

    const perms = await Notifications.getPermissionsAsync();
    if (perms.status === 'granted') {
      // Permission is good. Make sure the backend has a fresh token —
      // covers users who granted before but lost their token (reinstall, etc).
      registerPushToken().catch(() => {});
      return 'granted';
    }

    const lastRaw = await AsyncStorage.getItem(PERMISSION_PROMPT_KEY);
    const lastAt = lastRaw ? parseInt(lastRaw, 10) : 0;
    if (lastAt && Date.now() - lastAt < PERMISSION_PROMPT_COOLDOWN_MS) {
      return 'cooldown';
    }

    const subject = opts.subject?.trim();
    const valueLine =
      opts.context === 'fighter-follow'
        ? subject
          ? `We'll ping you 15 min before ${subject} walks out — if notifications are on.`
          : `We'll ping you 15 min before fighters you follow walk out — if notifications are on.`
        : subject
          ? `We'll ping you 15 min before ${subject} — if notifications are on.`
          : `We'll ping you 15 min before this fight — if notifications are on.`;

    const userChoice = await new Promise<'enable' | 'dismiss'>((resolve) => {
      Alert.alert(
        'Enable notifications?',
        valueLine,
        [
          { text: 'Not now', style: 'cancel', onPress: () => resolve('dismiss') },
          { text: 'Enable', onPress: () => resolve('enable') },
        ],
        { cancelable: true, onDismiss: () => resolve('dismiss') },
      );
    });

    if (userChoice === 'dismiss') {
      await AsyncStorage.setItem(PERMISSION_PROMPT_KEY, String(Date.now()));
      return 'denied';
    }

    // canAskAgain is false on iOS after the user has already denied the system prompt once.
    const canAskAgain = perms.canAskAgain !== false;
    if (canAskAgain) {
      const granted = await requestNotificationPermissions();
      if (granted) {
        await registerPushToken();
        return 'requested';
      }
      await AsyncStorage.setItem(PERMISSION_PROMPT_KEY, String(Date.now()));
      return 'denied';
    }

    // Can't ask again — deep-link to Settings. Mark prompt as shown either way.
    await AsyncStorage.setItem(PERMISSION_PROMPT_KEY, String(Date.now()));
    try {
      await Linking.openSettings();
    } catch {}
    return 'denied';
  } catch (err) {
    console.error('[Notifications] ensurePushPermissionAfterAction failed:', err);
    return 'unavailable';
  } finally {
    promptInFlight = false;
  }
}

export const notificationService = {
  requestNotificationPermissions,
  registerPushToken,
  addNotificationResponseListener,
  addNotificationReceivedListener,
  getLastNotificationResponseAsync,
  ensurePushPermissionAfterAction,
};
