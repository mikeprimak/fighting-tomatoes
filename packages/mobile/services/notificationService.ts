import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Check if running in Expo Go (push notifications not supported in SDK 53+)
const isExpoGo = Constants.appOwnership === 'expo';

// Conditionally import Notifications to avoid library-level warnings in Expo Go
let Notifications: any = null;
if (!isExpoGo) {
  Notifications = require('expo-notifications');

  // Configure how notifications are displayed when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  // Skip if running in Expo Go (not supported in SDK 53+)
  if (isExpoGo || !Notifications) {
    return false;
  }

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
  // Skip if running in Expo Go (not supported in SDK 53+)
  if (isExpoGo || !Notifications) {
    console.log('Push notifications not available in Expo Go - use a development build');
    return null;
  }

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
  // Skip if running in Expo Go (not supported in SDK 53+)
  if (isExpoGo || !Notifications) {
    return { remove: () => {} };
  }
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Handle notifications received while app is foregrounded
 */
export function addNotificationReceivedListener(
  callback: (notification: any) => void
) {
  // Skip if running in Expo Go (not supported in SDK 53+)
  if (isExpoGo || !Notifications) {
    return { remove: () => {} };
  }
  return Notifications.addNotificationReceivedListener(callback);
}

export const notificationService = {
  requestNotificationPermissions,
  registerPushToken,
  addNotificationResponseListener,
  addNotificationReceivedListener,
};
