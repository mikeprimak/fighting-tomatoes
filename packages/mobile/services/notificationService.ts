import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Check if running in Expo Go
// Push notifications ARE supported in Expo Go SDK 54+
const isExpoGo = Constants.appOwnership === 'expo';

// Lazy load Notifications to prevent initialization on import
let Notifications: any = null;
let isInitialized = false;
let tokenRegistered = false;

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

export const notificationService = {
  requestNotificationPermissions,
  registerPushToken,
  addNotificationResponseListener,
  addNotificationReceivedListener,
  getLastNotificationResponseAsync,
};
