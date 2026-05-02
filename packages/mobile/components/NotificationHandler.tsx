import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from '../services/notificationService';
import { useNotification } from '../store/NotificationContext';
import { useReviewPrompt } from '../store/ReviewPromptContext';
import { recordNotificationTap } from '../services/reviewPrompt';

/**
 * Component that handles notification responses and sets up deep linking
 * This works even when the app is opened from a killed state
 */
export function NotificationHandler() {
  const router = useRouter();
  const { setPreEventMessage } = useNotification();
  const { requestPrompt } = useReviewPrompt();

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
          } else if (data.fightId) {
            // Cold-start route to fight detail (covers comment_liked + fight_start).
            console.log('[NotificationHandler] Cold-start → /fight/' + data.fightId);
            router.push(`/fight/${data.fightId}` as any);
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
      } else if (data.type === 'comment_liked' && data.fightId) {
        // Open the fight detail screen for the comment that got liked.
        // /fight/[id] auto-routes to UpcomingFightDetailScreen or CompletedFightDetailScreen
        // based on fight/event status.
        console.log('[NotificationHandler] comment_liked → /fight/' + data.fightId);
        router.push(`/fight/${data.fightId}` as any);
      } else if (data.fightId) {
        // Any other fight-scoped notification (e.g. fight start) — route to the fight detail.
        router.push(`/fight/${data.fightId}` as any);
      } else {
        // Unscoped fallback — go to live events.
        router.push('/(tabs)/live-events');
      }

      try {
        const ready = await recordNotificationTap();
        if (ready) {
          setTimeout(() => {
            requestPrompt().catch(() => {});
          }, 5000);
        }
      } catch (err) {
        console.warn('[NotificationHandler] reviewPrompt error:', err);
      }
    });

    return () => {
      console.log('[NotificationHandler] Removing notification listener');
      subscription.remove();
    };
  }, [router, setPreEventMessage, requestPrompt]);

  // This component doesn't render anything
  return null;
}
