import React, { useCallback, useState, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
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

const EVENTS_PER_PAGE = 2;

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
  fights?: Fight[];
}

type Fight = any;

const formatDate = (dateString: string) => formatEventDate(dateString);
const formatTime = (dateString: string) => formatEventTimeCompact(dateString);

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

  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });
    }, [queryClient])
  );

  // Reuse the exact same query as the upcoming events screen — instant cache hit
  const {
    data: eventsData,
    isLoading,
    isFetching,
    error: eventsError,
    isError,
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
      refetchOnWindowFocus: true,
    }
  );

  // Filter to only LIVE events from all loaded pages
  const liveEvents = React.useMemo(() => {
    const allEvents = eventsData?.pages.flatMap(page => page.events) || [];
    const seen = new Set<string>();
    const deduped = allEvents.filter((event: Event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
    const live = deduped.filter((event: Event) => event.eventStatus === 'LIVE');
    return filterEventsByOrg(live);
  }, [eventsData, filterEventsByOrg]);

  // Only UFC has reliable real-time fight-start detection for "Notify Me" notifications
  const NOTIFY_PROMOTIONS = ['UFC'];

  const handleFightPress = useCallback((fight: Fight, event?: Event) => {
    if (!fight.fightStatus || fight.fightStatus === 'UPCOMING') {
      setModalFight(fight);
      setModalShowBell(
        event?.hasLiveTracking === true &&
        NOTIFY_PROMOTIONS.includes(event?.promotion || '')
      );
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
        {mainCard.length > 0 && (
          <View style={styles.cardSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.columnHeaders}>
                <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                  HYPE
                </Text>
              </View>
              <View style={[styles.sectionHeaderCenter, { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  MAIN CARD
                </Text>
                {event.mainStartTime && (
                  <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                    {formatTime(event.mainStartTime)}
                  </Text>
                )}
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
            {[...mainCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
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
                index={index}
              />
            ))}
          </View>
        )}

        {prelimCard.length > 0 && (
          <View style={styles.cardSection}>
            <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
              <View style={[styles.sectionHeaderCenter, { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  PRELIMS
                </Text>
                {event.prelimStartTime && (
                  <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                    {formatTime(event.prelimStartTime)}
                  </Text>
                )}
              </View>
            </View>
            {[...prelimCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
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
                index={mainCard.length + index}
              />
            ))}
          </View>
        )}

        {earlyPrelims.length > 0 && (
          <View style={styles.cardSection}>
            <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
              <View style={[styles.sectionHeaderCenter, { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  EARLY PRELIMS
                </Text>
                {event.earlyPrelimStartTime && (
                  <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                    {formatTime(event.earlyPrelimStartTime)}
                  </Text>
                )}
              </View>
            </View>
            {[...earlyPrelims].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
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
                index={mainCard.length + prelimCard.length + index}
              />
            ))}
          </View>
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
});
