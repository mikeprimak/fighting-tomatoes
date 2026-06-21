import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, AppNotification } from '../services/api';
import { useAuth } from '../store/AuthContext';

const LIST_KEY = ['notifications', 'list'] as const;
const UNREAD_KEY = ['notifications', 'unread-count'] as const;

/**
 * Full notification list (last 7 days) for the Notifications screen.
 */
export function useNotifications() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => apiService.getNotifications(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

/**
 * Lightweight unread-count poll for the nav-bar envelope badge. Kept on its own
 * query key so it never collides with the full list fetch.
 */
export function useUnreadNotificationCount() {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => apiService.getNotificationUnreadCount(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  return data?.unreadCount ?? 0;
}

/**
 * Mark notifications read. Pass ids to mark a subset; omit to mark all.
 * Optimistically clears the badge and refreshes both queries.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => apiService.markNotificationsRead(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}

/**
 * Set or clear the "Silence for N hours" snooze. Pass 0 hours to clear.
 * Refreshes the list (which carries snoozedUntil).
 */
export function useSetNotificationSnooze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hours: number) => apiService.setNotificationSnooze(hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export type { AppNotification };
