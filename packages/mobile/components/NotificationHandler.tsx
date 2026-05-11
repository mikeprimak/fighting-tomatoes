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

    // Deduplicate: cold-start (getLastNotificationResponseAsync) and the listener
    // can both deliver the same tap, causing a double router.push that makes the
    // first back press a silent no-op.
    const handledNotifIds = new Set<string>();

    const handleResponse = async (response: any, isInitial: boolean) => {
      const notifId = response?.notification?.request?.identifier;
      if (notifId) {
        if (handledNotifIds.has(notifId)) {
          console.log('[NotificationHandler] Skipping duplicate notification tap:', notifId);
          return;
        }
        handledNotifIds.add(notifId);
      }

      const data = response.notification.request.content.data;
      const body = response.notification.request.content.body;
      console.log('[NotificationHandler] Notification tapped (initial=' + isInitial + '):', data);

      if (data.type === 'preEventReport') {
        try {
          await AsyncStorage.setItem('pendingPreEventMessage', body || '');
        } catch (error) {
          console.error('[NotificationHandler] Error saving to AsyncStorage:', error);
        }
        if (!isInitial) setPreEventMessage(body || '');
        router.push('/(tabs)/events');
      } else if (data.fightId) {
        // Fight-scoped notifications (fight_start / walkout / comment_liked).
        // Switch the active tab to live-events first so a single back tap from
        // the fight detail returns the user to the Live Events screen.
        router.navigate('/(tabs)/live-events' as any);
        router.push(`/fight/${data.fightId}` as any);
      } else {
        router.push('/(tabs)/live-events');
      }

      if (!isInitial) {
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
      }
    };

    notificationService
      .getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response, true);
      })
      .catch((error) => {
        console.error('[NotificationHandler] Error handling initial notification:', error);
      });

    const subscription = notificationService.addNotificationResponseListener((response) => {
      handleResponse(response, false);
    });

    return () => {
      console.log('[NotificationHandler] Removing notification listener');
      subscription.remove();
    };
  }, [router, setPreEventMessage, requestPrompt]);

  // This component doesn't render anything
  return null;
}
