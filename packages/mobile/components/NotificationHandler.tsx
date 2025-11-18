import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from '../services/notificationService';
import { useNotification } from '../store/NotificationContext';

/**
 * Component that handles notification responses and sets up deep linking
 * This works even when the app is opened from a killed state
 */
export function NotificationHandler() {
  const router = useRouter();
  const { setPreEventMessage } = useNotification();

  useEffect(() => {
    console.log('[NotificationHandler] Setting up notification listener');

    // Handle notification that opened the app (when app was killed)
    const handleInitialNotification = async () => {
      try {
        const response = await notificationService.getLastNotificationResponseAsync();
        if (response) {
          console.log('[NotificationHandler] App opened from notification:', response.notification.request.content.data);
          const data = response.notification.request.content.data;
          const body = response.notification.request.content.body;

          if (data.type === 'preEventReport') {
            console.log('[NotificationHandler] Saving initial notification message to AsyncStorage');
            await AsyncStorage.setItem('pendingPreEventMessage', body || '');
          }
        }
      } catch (error) {
        console.error('[NotificationHandler] Error handling initial notification:', error);
      }
    };

    handleInitialNotification();

    const subscription = notificationService.addNotificationResponseListener(async (response) => {
      const data = response.notification.request.content.data;
      const body = response.notification.request.content.body;
      console.log('[NotificationHandler] Notification tapped:', data);
      console.log('[NotificationHandler] Notification body:', body);

      // Handle pre-event report notifications
      if (data.type === 'preEventReport') {
        console.log('[NotificationHandler] Pre-event notification detected, setting message:', body);

        // Save to AsyncStorage first - this will survive app restart
        try {
          await AsyncStorage.setItem('pendingPreEventMessage', body || '');
          console.log('[NotificationHandler] Saved message to AsyncStorage');
        } catch (error) {
          console.error('[NotificationHandler] Error saving to AsyncStorage:', error);
        }

        // Set in context for immediate display (if app is already running)
        setPreEventMessage(body || '');

        // Navigate to events screen
        console.log('[NotificationHandler] Navigating to events screen');
        router.push('/(tabs)/events');
      } else if (data.screen === 'community') {
        router.push('/(tabs)/community');
      } else if (data.fightId) {
        router.push(`/fight/${data.fightId}`);
      } else if (data.crewId) {
        router.push(`/crew/${data.crewId}`);
      }
    });

    return () => {
      console.log('[NotificationHandler] Removing notification listener');
      subscription.remove();
    };
  }, [router, setPreEventMessage]);

  // This component doesn't render anything
  return null;
}
