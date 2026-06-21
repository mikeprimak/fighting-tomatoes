import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import {
  useNotifications,
  useMarkNotificationsRead,
  useSetNotificationSnooze,
  AppNotification,
} from '../hooks/useNotifications';

const SNOOZE_HOURS = 8;

function formatSnoozeUntil(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function iconForType(type: string): React.ComponentProps<typeof FontAwesome>['name'] {
  switch (type) {
    case 'FIGHT_STARTING':
      return 'bolt';
    case 'FIGHTER_FIGHTING_SOON':
      return 'calendar';
    case 'REVIEW_UPVOTED':
      return 'thumbs-up';
    case 'COMMENT_REPLIED':
      return 'reply';
    case 'LEVEL_UP':
      return 'star';
    default:
      return 'bell';
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function navigateTo(n: AppNotification) {
  if (!n.linkId) return;
  if (n.linkType === 'event') {
    router.push(`/event/${n.linkId}` as any);
  } else if (n.linkType === 'fight' || n.linkType === 'review') {
    router.push(`/fight/${n.linkId}` as any);
  }
}

export default function NotificationsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { data, isLoading, isError, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const setSnooze = useSetNotificationSnooze();

  const snoozedUntil = data?.snoozedUntil ?? null;

  // Snapshot which ids were unread when the screen opened, so the "new" highlight
  // persists for this view even after we mark everything read in the background.
  const unreadAtOpen = useRef<Set<string> | null>(null);
  const markedRef = useRef(false);

  useEffect(() => {
    if (!data) return;
    if (unreadAtOpen.current === null) {
      unreadAtOpen.current = new Set(
        data.notifications.filter((n) => !n.isRead).map((n) => n.id),
      );
    }
    if (!markedRef.current && data.unreadCount > 0) {
      markedRef.current = true;
      markRead.mutate(undefined);
    }
  }, [data, markRead]);

  const renderItem = ({ item }: { item: AppNotification }) => {
    const wasUnread = unreadAtOpen.current?.has(item.id) ?? false;
    const tappable = !!item.linkId;
    return (
      <TouchableOpacity
        activeOpacity={tappable ? 0.6 : 1}
        disabled={!tappable}
        onPress={() => navigateTo(item)}
        style={[
          styles.row,
          { borderBottomColor: colors.border ?? '#2A2A2A' },
          wasUnread && { backgroundColor: (colors.tint ?? '#E11D48') + '14' },
        ]}
      >
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: (colors.tint ?? '#E11D48') + '22' },
          ]}
        >
          <FontAwesome name={iconForType(item.type)} size={16} color={colors.tint} />
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          {!!item.message && (
            <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.message}
            </Text>
          )}
          <Text style={[styles.time, { color: colors.textSecondary }]}>
            {relativeTime(item.createdAt)}
          </Text>
        </View>
        {wasUnread && <View style={[styles.unreadDot, { backgroundColor: colors.tint }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }}
              style={{ paddingVertical: 10, paddingHorizontal: 16, marginLeft: -8 }}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      {!isLoading && !isError && (
        <View style={[styles.snoozeBar, { backgroundColor: colors.card, borderBottomColor: colors.border ?? '#2A2A2A' }]}>
          <FontAwesome
            name={snoozedUntil ? 'bell-slash' : 'bell-slash-o'}
            size={16}
            color={snoozedUntil ? colors.tint : colors.textSecondary}
          />
          {snoozedUntil ? (
            <>
              <Text style={[styles.snoozeText, { color: colors.text }]} numberOfLines={1}>
                Silenced until {formatSnoozeUntil(snoozedUntil)}
              </Text>
              <TouchableOpacity
                disabled={setSnooze.isPending}
                onPress={() => setSnooze.mutate(0)}
                style={[styles.snoozeAction, { borderColor: colors.tint }]}
              >
                <Text style={{ color: colors.tint, fontWeight: '600', fontSize: 13 }}>Resume</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.snoozeText, { color: colors.textSecondary }]} numberOfLines={1}>
                Watching a live event?
              </Text>
              <TouchableOpacity
                disabled={setSnooze.isPending}
                onPress={() => setSnooze.mutate(SNOOZE_HOURS)}
                style={[styles.snoozeAction, { borderColor: colors.tint }]}
              >
                <Text style={{ color: colors.tint, fontWeight: '600', fontSize: 13 }}>
                  Silence {SNOOZE_HOURS}h
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <FontAwesome name="exclamation-circle" size={32} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Couldn&apos;t load notifications.
          </Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { borderColor: colors.tint }]}>
            <Text style={{ color: colors.tint }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (data?.notifications.length ?? 0) === 0 ? (
        <View style={styles.center}>
          <FontAwesome name="bell-o" size={36} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications yet</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Follow fighters and turn on alerts to get notified when they fight.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data?.notifications ?? []}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  snoozeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  snoozeText: { flex: 1, fontSize: 13 },
  snoozeAction: { borderWidth: 1, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  message: { fontSize: 13, marginTop: 2 },
  time: { fontSize: 12, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 20 },
});
