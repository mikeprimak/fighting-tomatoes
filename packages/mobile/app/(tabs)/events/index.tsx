import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Image,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { FightDisplayCard, EventBannerCard, SearchBar } from '../../../components';
import OrgFilterTabs from '../../../components/OrgFilterTabs';
import { useAuth } from '../../../store/AuthContext';
import { useNotification } from '../../../store/NotificationContext';
import { useOrgFilter } from '../../../store/OrgFilterContext';
import { useSearch } from '../../../store/SearchContext';
import FontAwesome from '@expo/vector-icons/FontAwesome';

// Number of events to load initially and per page
const EVENTS_PER_PAGE = 2;

interface Event {
  id: string;
  name: string;
  date: string;
  venue?: string;
  location?: string;
  promotion: string;
  hasStarted: boolean;
  isComplete: boolean;
  bannerImage?: string | null;
  earlyPrelimStartTime?: string | null;
  prelimStartTime?: string | null;
  mainStartTime?: string | null;
  fights?: Fight[];
}

type Fight = any;

// Placeholder image selection logic
const getPlaceholderImage = (eventId: string) => {
  const images = [
    require('../../../assets/events/event-banner-1.jpg'),
    require('../../../assets/events/event-banner-2.jpg'),
    require('../../../assets/events/event-banner-3.jpg'),
  ];

  const lastCharCode = eventId.charCodeAt(eventId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

// Pure formatting functions - defined at module level for stable references
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;

  // Only show minutes if not on the hour
  if (minutes === 0) {
    return `${hour12}${ampm}`;
  }
  return `${hour12}:${minutes.toString().padStart(2, '0')}${ampm}`;
};

const formatTimeUntil = (dateString: string) => {
  const eventDate = new Date(dateString);
  const now = new Date();

  // Get calendar dates (ignoring time)
  const eventCalendarDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const todayCalendarDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Calculate difference in calendar days
  const diffTime = eventCalendarDate.getTime() - todayCalendarDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // If it's today, show hours remaining or "TODAY"
  if (diffDays === 0) {
    const hoursUntil = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60));
    if (hoursUntil <= 0) {
      return 'TODAY';
    }
    if (hoursUntil === 1) {
      return 'IN 1 HOUR';
    }
    return `IN ${hoursUntil} HOURS`;
  }

  if (diffDays === 1) {
    return 'TOMORROW';
  }

  if (diffDays < 7) {
    return `IN ${diffDays} DAYS`;
  }

  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks === 1) {
    return 'IN 1 WEEK';
  }

  // Show weeks for 2-3 weeks, then 5-7 weeks
  // 4 weeks = 1 month, 8 weeks = 2 months
  if (diffWeeks <= 3) {
    return `IN ${diffWeeks} WEEKS`;
  }

  if (diffWeeks >= 5 && diffWeeks <= 7) {
    return `IN ${diffWeeks} WEEKS`;
  }

  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths === 1) {
    return 'IN 1 MONTH';
  }

  if (diffMonths < 12) {
    return `IN ${diffMonths} MONTHS`;
  }

  const diffYears = Math.round(diffDays / 365);
  if (diffYears === 1) {
    return 'IN 1 YEAR';
  }

  return `IN ${diffYears} YEARS`;
};


export default function UpcomingEventsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { preEventMessage, setPreEventMessage } = useNotification();
  const { selectedOrgs } = useOrgFilter();
  const { isSearchVisible } = useSearch();

  // Ref to FlatList for scrolling to top on filter change
  const flatListRef = useRef<FlatList>(null);

  // Convert selected orgs to comma-separated string for API
  const promotionsFilter = selectedOrgs.size > 0
    ? Array.from(selectedOrgs).join(',')
    : undefined;

  // Check AsyncStorage for pending notification message on mount
  useEffect(() => {
    const checkPendingMessage = async () => {
      try {
        const pendingMessage = await AsyncStorage.getItem('pendingPreEventMessage');
        if (pendingMessage) {
          console.log('[Events Screen] Found pending message from AsyncStorage:', pendingMessage);
          setPreEventMessage(pendingMessage);
          // Clear it from storage after reading
          await AsyncStorage.removeItem('pendingPreEventMessage');
        }
      } catch (error) {
        console.error('[Events Screen] Error checking AsyncStorage:', error);
      }
    };

    checkPendingMessage();
  }, [setPreEventMessage]);

  // Refetch fight data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      // Invalidate upcoming events queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });
    }, [queryClient])
  );

  // Fetch upcoming events with fights included using infinite query for lazy loading
  // Server-side filtering by promotion when filter is active
  const {
    data: eventsData,
    isLoading: eventsLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    ['upcomingEvents', isAuthenticated, promotionsFilter],
    async ({ pageParam = 1 }) => {
      return apiService.getEvents({
        type: 'upcoming',
        includeFights: true,
        page: pageParam,
        limit: EVENTS_PER_PAGE,
        promotions: promotionsFilter,
      });
    },
    {
      getNextPageParam: (lastPage) => {
        const { page, totalPages } = lastPage.pagination;
        return page < totalPages ? page + 1 : undefined;
      },
      staleTime: 30 * 1000, // 30 seconds - refresh frequently for live status
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    }
  );

  // Flatten all pages of events into a single array and deduplicate by ID
  const allEvents = React.useMemo(() => {
    const events = eventsData?.pages.flatMap(page => page.events) || [];
    // Deduplicate events by ID (in case same event appears in multiple pages due to cache)
    const seen = new Set<string>();
    return events.filter((event: Event) => {
      if (seen.has(event.id)) {
        console.warn('[Events] Duplicate event filtered:', event.id, event.name);
        return false;
      }
      seen.add(event.id);
      return true;
    });
  }, [eventsData]);

  // Check if any event is live
  const hasLiveEvent = allEvents.some((event: Event) => event.hasStarted && !event.isComplete);

  // Sort upcoming events (live events first, then by date)
  // Note: Filtering is now done server-side via promotions param
  const upcomingEvents = React.useMemo(() => {
    return [...allEvents].sort((a: Event, b: Event) => {
      const aIsLive = a.hasStarted && !a.isComplete;
      const bIsLive = b.hasStarted && !b.isComplete;
      if (aIsLive && !bIsLive) return -1;
      if (!aIsLive && bIsLive) return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [allEvents]);

  // Scroll to top when filter changes
  const handleFilterChange = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 50);
  }, []);

  // Handler for loading more events when reaching end of list
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleFightPress = useCallback((fight: Fight) => {
    router.push(`/fight/${fight.id}`);
  }, [router]);

  const styles = createStyles(colors);

  // Memoized render function for FlatList - must be before early returns (Rules of Hooks)
  const renderEventSection = useCallback(({ item, index }: { item: Event; index: number }) => (
    <EventSection
      event={item}
      colors={colors}
      isAuthenticated={isAuthenticated}
      onFightPress={handleFightPress}
      formatDate={formatDate}
      formatTime={formatTime}
      formatTimeUntil={formatTimeUntil}
      isFirstEvent={index === 0}
    />
  ), [colors, isAuthenticated, handleFightPress]);

  // Stable key extractor
  const keyExtractor = useCallback((item: Event) => item.id, []);

  // Header component for notification banner only
  const ListHeaderComponent = useCallback(() => {
    if (!preEventMessage) return null;
    return (
      <View style={[styles.notificationBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
        <View style={styles.notificationIconContainer}>
          <FontAwesome name="bell" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.notificationText, { color: colors.text }]}>
          {preEventMessage}
        </Text>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={() => setPreEventMessage(null)}
        >
          <FontAwesome name="times" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  }, [preEventMessage, colors, setPreEventMessage, styles]);

  // Footer component for loading more indicator
  const ListFooterComponent = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.loadMoreContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadMoreText, { color: colors.textSecondary }]}>Loading more events...</Text>
      </View>
    );
  }, [isFetchingNextPage, colors, styles.loadMoreContainer, styles.loadMoreText]);

  // Empty component when no events match filter (don't show while loading)
  const ListEmptyComponent = useCallback(() => {
    if (isFetching) return null;
    const message = selectedOrgs.size > 0
      ? `No upcoming ${Array.from(selectedOrgs).join(' or ')} events`
      : 'No upcoming events';
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>
          {message}
        </Text>
      </View>
    );
  }, [selectedOrgs.size, colors, styles, isFetching]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Organization Filter Tabs - Hidden when search is visible */}
      {!isSearchVisible && <OrgFilterTabs onFilterChange={handleFilterChange} />}

      {/* Search Bar - Shown when search is visible */}
      <SearchBar />

      {eventsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading events...</Text>
        </View>
      ) : (
      <FlatList
        ref={flatListRef}
        data={upcomingEvents}
        renderItem={renderEventSection}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        // Lazy loading - load more events when reaching end
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        // Enable clipping for better scroll performance
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={5}
      />
      )}
    </SafeAreaView>
  );
}

// Event Section Component - Shows banner + all fights for one event
// Memoized to prevent re-renders when other events in the list change
const EventSection = memo(function EventSection({
  event,
  colors,
  isAuthenticated,
  onFightPress,
  formatDate,
  formatTime,
  formatTimeUntil,
  isFirstEvent,
}: {
  event: Event;
  colors: any;
  isAuthenticated: boolean;
  onFightPress: (fight: Fight) => void;
  formatDate: (date: string) => string;
  formatTime: (date: string) => string;
  formatTimeUntil: (date: string) => string;
  isFirstEvent: boolean;
}) {
  const isLive = event.hasStarted && !event.isComplete;

  // Use fights from event data (loaded via includeFights parameter)
  // Deduplicate fights by ID in case of data issues
  const fights = React.useMemo(() => {
    const allFights = event.fights || [];
    const seen = new Set<string>();
    return allFights.filter((fight: Fight) => {
      if (seen.has(fight.id)) {
        console.warn('[Events] Duplicate fight filtered:', fight.id);
        return false;
      }
      seen.add(fight.id);
      return true;
    });
  }, [event.fights]);

  // Group fights by card section
  const hasEarlyPrelims = !!event.earlyPrelimStartTime;
  const mainCard = fights.filter((f: Fight) => f.orderOnCard <= 5);
  const prelimCard = hasEarlyPrelims
    ? fights.filter((f: Fight) => f.orderOnCard > 5 && f.orderOnCard <= 9)
    : fights.filter((f: Fight) => f.orderOnCard > 5);
  const earlyPrelims = hasEarlyPrelims ? fights.filter((f: Fight) => f.orderOnCard > 9) : [];

  // Find next fight and last completed fight
  const nextFight = fights
    .filter((f: Fight) => !f.hasStarted && !f.isComplete)
    .sort((a, b) => b.orderOnCard - a.orderOnCard)[0];

  const lastCompletedFight = fights
    .filter((f: Fight) => f.isComplete)
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime;
    })[0];

  const hasLiveFight = fights.some((f: Fight) => f.hasStarted && !f.isComplete);

  // DEV OVERRIDE: Force "Costa vs Charriere" to show as "Live Now"
  const DEV_FORCE_LIVE_NOW = false; // Set to false to disable
  const isCostaVsCharriere = (fight: Fight) => {
    const f1 = `${fight.fighter1?.lastName || ''}`.toLowerCase();
    const f2 = `${fight.fighter2?.lastName || ''}`.toLowerCase();
    return (f1.includes('costa') && f2.includes('charriere')) ||
           (f1.includes('charriere') && f2.includes('costa'));
  };
  // Helper to get dev-modified fight (with hasStarted for Live Now state)
  const getDevFight = (fight: Fight) => {
    if (DEV_FORCE_LIVE_NOW && isCostaVsCharriere(fight)) {
      return { ...fight, hasStarted: true, isComplete: false };
    }
    return fight;
  };
  const devLastCompletedTime = null;

  const styles = createStyles(colors);

  // Determine earliest start time for countdown
  const getEarliestStartTime = () => {
    if (event.earlyPrelimStartTime) return event.earlyPrelimStartTime;
    if (event.prelimStartTime) return event.prelimStartTime;
    if (event.mainStartTime) return event.mainStartTime;
    return event.date; // Fallback to event date
  };

  // Check if event should be considered live based on time
  const earliestTime = getEarliestStartTime();
  const now = new Date();
  const startTime = new Date(earliestTime);
  const isEventLive = (now >= startTime && !event.isComplete) || isLive;

  // Debug logging for Bonfim event
  if (event.name.includes('Bonfim')) {
    console.log('=== BONFIM EVENT DEBUG ===');
    console.log('Event name:', event.name);
    console.log('event.hasStarted:', event.hasStarted);
    console.log('event.isComplete:', event.isComplete);
    console.log('isLive (from line 275):', isLive);
    console.log('earliestTime:', earliestTime);
    console.log('now:', now.toISOString());
    console.log('startTime:', startTime.toISOString());
    console.log('now >= startTime:', now >= startTime);
    console.log('isEventLive:', isEventLive);
    console.log('formatTimeUntil result:', formatTimeUntil(earliestTime));
    console.log('event.prelimStartTime:', event.prelimStartTime);
    console.log('event.mainStartTime:', event.mainStartTime);
    console.log('event.date:', event.date);
  }

  return (
    <View style={styles.eventSection}>
      {/* Event Banner and Info */}
      <EventBannerCard
        event={event}
        statusBadge={{
          text: isEventLive ? 'LIVE NOW' : formatTimeUntil(getEarliestStartTime()),
          backgroundColor: isEventLive ? colors.danger : '#F5C518',
          textColor: isEventLive ? '#FFFFFF' : '#000000',
        }}
      />

      {/* Fights List */}
      <View style={styles.fightsContainer}>
          {/* Main Card */}
          {mainCard.length > 0 && (
            <View style={styles.cardSection}>
              {[...mainCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
                <FightDisplayCard
                  key={fight.id}
                  fight={getDevFight(fight)}
                  onPress={() => onFightPress(fight)}
                  showEvent={false}
                  isNextFight={nextFight?.id === fight.id}
                  hasLiveFight={DEV_FORCE_LIVE_NOW && isCostaVsCharriere(fight) ? true : hasLiveFight}
                  lastCompletedFightTime={lastCompletedFight?.updatedAt}
                  enableHypeAnimation={true}
                  enableRatingAnimation={true}
                  index={index}
                />
              ))}
            </View>
          )}

          {/* Preliminary Card */}
          {prelimCard.length > 0 && (
            <View style={styles.cardSection}>
              <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
                {/* Center - Title and Time on same line */}
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
                  fight={getDevFight(fight)}
                  onPress={() => onFightPress(fight)}
                  showEvent={false}
                  isNextFight={nextFight?.id === fight.id}
                  hasLiveFight={DEV_FORCE_LIVE_NOW && isCostaVsCharriere(fight) ? true : hasLiveFight}
                  lastCompletedFightTime={lastCompletedFight?.updatedAt}
                  enableHypeAnimation={true}
                  enableRatingAnimation={true}
                  index={mainCard.length + index}
                />
              ))}
            </View>
          )}

          {/* Early Prelims */}
          {earlyPrelims.length > 0 && (
            <View style={styles.cardSection}>
              <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
                {/* Center - Title and Time on same line */}
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
                  fight={getDevFight(fight)}
                  onPress={() => onFightPress(fight)}
                  showEvent={false}
                  isNextFight={nextFight?.id === fight.id}
                  hasLiveFight={DEV_FORCE_LIVE_NOW && isCostaVsCharriere(fight) ? true : hasLiveFight}
                  lastCompletedFightTime={lastCompletedFight?.updatedAt}
                  enableHypeAnimation={true}
                  enableRatingAnimation={true}
                  index={mainCard.length + prelimCard.length + index}
                />
              ))}
            </View>
          )}

          {/* More Fights Note - Show when fewer than 7 fights announced */}
          {fights.length < 7 && fights.length > 0 && (
            <View style={styles.moreFightsNote}>
              <Text style={[styles.moreFightsText, { color: colors.textSecondary, opacity: 0.5 }]}>
                TBA
              </Text>
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
  loadMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadMoreText: {
    fontSize: 14,
  },
  notificationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 15,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  notificationIconContainer: {
    marginTop: 2,
  },
  notificationText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  dismissButton: {
    padding: 4,
    marginTop: -2,
  },
  eventSection: {
    marginBottom: 32,
  },
  eventHeader: {
    overflow: 'hidden',
  },
  eventBanner: {
    width: '100%',
    height: 200,
  },
  eventInfo: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  eventName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
    flexShrink: 1,
  },
  eventSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    flexShrink: 1,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  eventDate: {
    fontSize: 14,
  },
  eventLocation: {
    fontSize: 13,
    marginTop: 4,
  },
  fightsLoadingContainer: {
    padding: 20,
    alignItems: 'center',
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
    marginBottom: 4,
    position: 'relative',
  },
  sectionHeaderPrelims: {
    paddingTop: 8,
    paddingBottom: 9,
    marginTop: 16,
    marginBottom: 13,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto', // Push to the right when no left content
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
    marginLeft: -16,
    width: 60,
    justifyContent: 'center',
  },
  columnHeadersRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginRight: -18,
    width: 60,
    justifyContent: 'center',
  },
  columnHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  moreFightsNote: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  moreFightsText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
});
