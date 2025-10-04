import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiService } from './api';

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

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
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
  try {
    // Request permissions first
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log('No notification permissions granted');
      return null;
    }

    // Get push token
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'your-project-id', // You'll need to add this to app.json
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
  callback: (notification: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Handle notifications received while app is foregrounded
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export const notificationService = {
  requestNotificationPermissions,
  registerPushToken,
  addNotificationResponseListener,
  addNotificationReceivedListener,
};
