import React, { useCallback, useState, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { FightDisplayCard, EventBannerCard } from '../../components';
import UpcomingFightModal from '../../components/UpcomingFightModal';
import OrgFilterTabs from '../../components/OrgFilterTabs';
import { useAuth } from '../../store/AuthContext';
import { useOrgFilter } from '../../store/OrgFilterContext';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { formatEventDate, formatEventTimeCompact } from '../../utils/dateFormatters';

const EVENTS_PER_PAGE = 5;

interface Event {
  id: string;
  name: string;
  date: string;
  venue?: string;
  location?: string;
  promotion: string;
  eventStatus: string;
  bannerImage?: string | null;
  earlyPrelimStartTime?: string | null;
  prelimStartTime?: string | null;
  mainStartTime?: string | null;
  hasLiveTracking?: boolean;
  notificationsAllowed?: boolean;
  fights?: Fight[];
}

type Fight = any;

const formatDate = (dateString: string) => formatEventDate(dateString);
const formatTime = (dateString: string) => formatEventTimeCompact(dateString);

// Treat an event as live if the backend has flagged it LIVE *or* its earliest
// start time has passed and it isn't COMPLETED. Mirrors the fallback on the
// event detail screen so the Live tab doesn't lag behind the 5-minute
// backend lifecycle tick.
const isEventLiveNow = (event: Event): boolean => {
  if (event.eventStatus === 'LIVE') return true;
  if (event.eventStatus === 'COMPLETED') return false;
  const startStr = event.earlyPrelimStartTime || event.prelimStartTime || event.mainStartTime || event.date;
  if (!startStr) return false;
  return Date.now() >= new Date(startStr).getTime();
};

export default function LiveEventsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { selectedOrgs, filterEventsByOrg } = useOrgFilter();
  const [modalFight, setModalFight] = useState<Fight | null>(null);
  const [modalShowBell, setModalShowBell] = useState(false);

  const promotionsFilter = selectedOrgs.size > 0
    ? Array.from(selectedOrgs).join(',')
    : undefined;

  // Refetch stale data when tab is focused, but don't invalidate the cache —
  // the 30s staleTime already controls freshness, so this only triggers a
  // background refetch if data is stale (avoids a full re-fetch + spinner).
  useFocusEffect(
    React.useCallback(() => {
      queryClient.refetchQueries({ queryKey: ['upcomingEvents'], type: 'active' });
    }, [queryClient])
  );

  // Reuse the exact same query as the upcoming events screen — instant cache hit
  const {
    data: eventsData,
    isLoading,
    isFetching,
    error: eventsError,
    isError,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery(
    ['upcomingEvents', isAuthenticated, promotionsFilter],
    async ({ pageParam = 1 }) => {
      const result = await apiService.getEvents({
        type: 'upcoming',
        includeFights: true,
        page: pageParam,
        limit: EVENTS_PER_PAGE,
        promotions: promotionsFilter,
      });
      return result;
    },
    {
      getNextPageParam: (lastPage) => {
        const { page, totalPages } = lastPage.pagination;
        return page < totalPages ? page + 1 : undefined;
      },
      staleTime: 30 * 1000,
      refetchInterval: 30000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    }
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  // Auto-fetch page 2 so we find all live events (they may not all be on page 1).
  // With 5 events per page, 2 pages = 10 events is plenty.
  React.useEffect(() => {
    if (!eventsData || !hasNextPage || isFetching) return;
    if (eventsData.pages.length < 2) {
      fetchNextPage();
    }
  }, [eventsData, hasNextPage, isFetching, fetchNextPage]);

  // Filter to only LIVE events from all loaded pages
  const liveEvents = React.useMemo(() => {
    const allEvents = eventsData?.pages.flatMap(page => page.events) || [];
    const seen = new Set<string>();
    const deduped = allEvents.filter((event: Event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
    const live = deduped.filter(isEventLiveNow);
    // Sort UFC events to the top
    const sorted = [...live].sort((a, b) => {
      const aIsUFC = a.promotion?.toUpperCase() === 'UFC' ? 0 : 1;
      const bIsUFC = b.promotion?.toUpperCase() === 'UFC' ? 0 : 1;
      return aIsUFC - bIsUFC;
    });
    return filterEventsByOrg(sorted);
  }, [eventsData, filterEventsByOrg]);

  const handleFightPress = useCallback((fight: Fight, event?: Event) => {
    if (!fight.fightStatus || fight.fightStatus === 'UPCOMING') {
      setModalFight(fight);
      setModalShowBell(event?.notificationsAllowed === true);
    } else {
      router.push(`/fight/${fight.id}`);
    }
  }, [router]);

  const styles = createStyles(colors);

  const renderEventSection = useCallback(({ item, index }: { item: Event; index: number }) => (
    <LiveEventSection
      event={item}
      colors={colors}
      isAuthenticated={isAuthenticated}
      onFightPress={handleFightPress}
      formatDate={formatDate}
      formatTime={formatTime}
    />
  ), [colors, isAuthenticated, handleFightPress]);

  const keyExtractor = useCallback((item: Event) => item.id, []);

  const emptyMessage = React.useMemo(() => {
    if (selectedOrgs.size === 0) return 'No live events right now';
    const orgNames = Array.from(selectedOrgs).join(', ');
    if (selectedOrgs.size === 1) return `No ${orgNames} events live currently`;
    return `No ${orgNames} events live currently`;
  }, [selectedOrgs]);

  const ListEmptyComponent = useCallback(() => {
    if (isFetching) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>
          {emptyMessage}
        </Text>
      </View>
    );
  }, [colors, styles, isFetching, emptyMessage]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <StatusBar barStyle="light-content" />

      <OrgFilterTabs onFilterChange={() => {}} />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading live events...</Text>
        </View>
      ) : isError ? (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.danger || '#ff0000' }]}>
            Error loading events
          </Text>
          <TouchableOpacity
            style={{ marginTop: 16, padding: 12, backgroundColor: colors.primary, borderRadius: 8 }}
            onPress={() => queryClient.invalidateQueries({ queryKey: ['liveEvents'] })}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={liveEvents}
          renderItem={renderEventSection}
          keyExtractor={keyExtractor}
          ListEmptyComponent={ListEmptyComponent}
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}

      <UpcomingFightModal
        visible={!!modalFight}
        fight={modalFight}
        onClose={() => setModalFight(null)}
        showNotificationBell={modalShowBell}
      />
    </SafeAreaView>
  );
}

const LiveEventSection = memo(function LiveEventSection({
  event,
  colors,
  isAuthenticated,
  onFightPress,
  formatDate,
  formatTime,
}: {
  event: Event;
  colors: any;
  isAuthenticated: boolean;
  onFightPress: (fight: Fight, event?: Event) => void;
  formatDate: (date: string) => string;
  formatTime: (date: string) => string;
}) {
  const fights = React.useMemo(() => {
    const allFights = event.fights || [];
    const seen = new Set<string>();
    return allFights.filter((fight: Fight) => {
      if (seen.has(fight.id)) return false;
      seen.add(fight.id);
      return true;
    });
  }, [event.fights]);

  const hasCardTypes = fights.some((f: Fight) => f.cardType);
  const hasEarlyPrelims = !!event.earlyPrelimStartTime;

  const isPrelims = (cardType: string) => {
    const lower = cardType.toLowerCase().trim();
    return (lower.includes('prelim') && !lower.includes('early')) ||
           lower === 'undercard' || lower === 'under card';
  };
  const isEarlyPrelims = (cardType: string) => {
    const lower = cardType.toLowerCase().trim();
    return lower.includes('early prelim') || lower.includes('early-prelim');
  };

  const mainCard = hasCardTypes
    ? fights.filter((f: Fight) => !f.cardType || (!isPrelims(f.cardType) && !isEarlyPrelims(f.cardType)))
    : fights.filter((f: Fight) => f.orderOnCard <= 5);
  const prelimCard = hasCardTypes
    ? fights.filter((f: Fight) => f.cardType && isPrelims(f.cardType))
    : hasEarlyPrelims
      ? fights.filter((f: Fight) => f.orderOnCard > 5 && f.orderOnCard <= 9)
      : fights.filter((f: Fight) => f.orderOnCard > 5);
  const earlyPrelims = hasCardTypes
    ? fights.filter((f: Fight) => f.cardType && isEarlyPrelims(f.cardType))
    : hasEarlyPrelims ? fights.filter((f: Fight) => f.orderOnCard > 9) : [];

  const nextFight = fights
    .filter((f: Fight) => f.fightStatus === 'UPCOMING')
    .sort((a: Fight, b: Fight) => b.orderOnCard - a.orderOnCard)[0];

  const lastCompletedFight = fights
    .filter((f: Fight) => f.fightStatus === 'COMPLETED')
    .sort((a: Fight, b: Fight) => {
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime;
    })[0];

  const hasLiveFight = fights.some((f: Fight) => f.fightStatus === 'LIVE');

  const styles = createStyles(colors);

  const isUpNext = (fight: Fight) =>
    fight.fightStatus === 'UPCOMING' && fight.id === nextFight?.id && !hasLiveFight && !!lastCompletedFight;

  const renderCardSection = (
    sectionFights: Fight[],
    title: string,
    startTime: string | null | undefined,
    isPrelimSection: boolean,
    indexOffset: number,
  ) => {
    const sorted = [...sectionFights].sort((a, b) => a.orderOnCard - b.orderOnCard);
    const upcoming = sorted.filter((f: Fight) => f.fightStatus === 'UPCOMING' && !isUpNext(f));
    const live = sorted.filter((f: Fight) => f.fightStatus === 'LIVE' || isUpNext(f));
    const completed = sorted.filter((f: Fight) => f.fightStatus === 'COMPLETED');

    const sectionTitleElement = (
      <View style={[styles.sectionHeaderCenter, { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {title}
        </Text>
        {startTime && (
          <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
            {formatTime(startTime)}
          </Text>
        )}
      </View>
    );

    return (
      <View style={styles.cardSection}>
        {/* Upcoming fights with HYPE / MY HYPE headers (main card only) or vertical gap (prelims) */}
        {upcoming.length > 0 && (
          <>
            {isPrelimSection ? (
              <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
                {sectionTitleElement}
              </View>
            ) : (
              <View style={styles.sectionHeader}>
                <View style={styles.columnHeaders}>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    HYPE
                  </Text>
                </View>
                <View style={styles.sectionHeaderCenter}>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                    UPCOMING BOUTS
                  </Text>
                </View>
                <View style={styles.columnHeadersRight}>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    MY
                  </Text>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    HYPE
                  </Text>
                </View>
              </View>
            )}
            {upcoming.map((fight: Fight, index: number) => (
              <FightDisplayCard
                key={fight.id}
                fight={fight}
                onPress={() => onFightPress(fight, event)}
                showEvent={false}
                isNextFight={nextFight?.id === fight.id}
                hasLiveFight={hasLiveFight}
                lastCompletedFightTime={lastCompletedFight?.updatedAt}
                enableHypeAnimation={true}
                enableRatingAnimation={true}
                index={indexOffset + index}
              />
            ))}
          </>
        )}

        {/* Standalone card section title when no upcoming fights but live/up-next exist.
            Skip entirely if section is all completed — the COMPLETED BOUTS header suffices. */}
        {upcoming.length === 0 && (live.length > 0 || completed.length === 0) && (
          isPrelimSection ? (
            <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
              {sectionTitleElement}
            </View>
          ) : (
            <View style={[styles.sectionHeader]}>
              {sectionTitleElement}
            </View>
          )
        )}

        {/* Live / Up Next fights */}
        {live.length > 0 && (
          <>
            <View style={{ height: 12 }} />
            {live.map((fight: Fight, index: number) => (
              <FightDisplayCard
                key={fight.id}
                fight={fight}
                onPress={() => onFightPress(fight, event)}
                showEvent={false}
                isNextFight={nextFight?.id === fight.id}
                hasLiveFight={hasLiveFight}
                lastCompletedFightTime={lastCompletedFight?.updatedAt}
                enableHypeAnimation={true}
                enableRatingAnimation={true}
                index={indexOffset + upcoming.length + index}
              />
            ))}
          </>
        )}

        {/* Completed fights with RATING / MY RATING headers (prelim sections just get a spacer) */}
        {completed.length > 0 && (
          <>
            {isPrelimSection ? (
              <View style={{ height: 16 }} />
            ) : (
              <View style={styles.statusHeader}>
                <View style={[styles.columnHeaders, { marginLeft: -16 }]}>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    RATING
                  </Text>
                </View>
                <View style={styles.sectionHeaderCenter}>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                    COMPLETED BOUTS
                  </Text>
                </View>
                <View style={[styles.columnHeadersRight, { marginRight: -18 }]}>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    MY
                  </Text>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    RATING
                  </Text>
                </View>
              </View>
            )}
            {completed.map((fight: Fight, index: number) => (
              <FightDisplayCard
                key={fight.id}
                fight={fight}
                onPress={() => onFightPress(fight, event)}
                showEvent={false}
                isNextFight={false}
                hasLiveFight={hasLiveFight}
                lastCompletedFightTime={lastCompletedFight?.updatedAt}
                enableHypeAnimation={false}
                enableRatingAnimation={true}
                index={indexOffset + upcoming.length + live.length + index}
              />
            ))}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.eventSection}>
      <EventBannerCard
        event={event}
        statusBadge={{
          text: 'LIVE NOW',
          backgroundColor: colors.danger,
          textColor: '#FFFFFF',
        }}
      />

      <View style={styles.fightsContainer}>
        {mainCard.length > 0 && renderCardSection(
          mainCard, 'MAIN CARD', event.mainStartTime, false, 0
        )}
        {prelimCard.length > 0 && renderCardSection(
          prelimCard, 'PRELIMS', event.prelimStartTime, true, mainCard.length
        )}
        {earlyPrelims.length > 0 && renderCardSection(
          earlyPrelims, 'EARLY PRELIMS', event.earlyPrelimStartTime, true, mainCard.length + prelimCard.length
        )}
      </View>
    </View>
  );
});

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  noEventsText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  eventSection: {
    marginBottom: 32,
  },
  fightsContainer: {
    marginTop: 0,
  },
  cardSection: {
    marginTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 2,
    position: 'relative',
  },
  sectionHeaderPrelims: {
    paddingTop: 8,
    paddingBottom: 9,
    marginTop: 16,
    marginBottom: 13,
  },
  sectionHeaderCenter: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    position: 'absolute',
    left: 0,
    right: 0,
    alignSelf: 'center',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionTime: {
    fontSize: 11,
    fontWeight: '600',
  },
  columnHeaders: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginLeft: -21,
    width: 60,
    justifyContent: 'center',
  },
  columnHeadersRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginRight: -21,
    width: 60,
    justifyContent: 'center',
  },
  columnHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 2,
    marginTop: 8,
  },
  liveNowHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 2,
  },
  liveNowText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
