import React, { useCallback, memo, useState, useRef } from 'react';
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
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { useAuth } from '../../../store/AuthContext';
import { useSearch } from '../../../store/SearchContext';
import { useOrgFilter } from '../../../store/OrgFilterContext';
import CompletedFightCard from '../../../components/fight-cards/CompletedFightCard';
import OrgFilterTabs from '../../../components/OrgFilterTabs';
import { EventBannerCard, SearchBar } from '../../../components';

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
  fights?: Fight[];
}

interface Fight {
  id: string;
  fighter1: any;
  fighter2: any;
  event: any;
  weightClass?: string;
  isTitle: boolean;
  cardSection?: string;
  orderOnCard: number;
  hasStarted: boolean;
  isComplete: boolean;
  winner?: string | null;
  method?: string | null;
  round?: number | null;
  time?: string | null;
  averageRating: number;
  userRating?: number;
  userReview?: string;
  userHypePrediction?: number;
}

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


const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTimeAgo = (dateString: string) => {
  const eventDate = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - eventDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'TODAY';
  }

  if (diffDays === 1) {
    return 'YESTERDAY';
  }

  if (diffDays < 7) {
    return `${diffDays} DAYS AGO`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) {
    return '1 WEEK AGO';
  }

  if (diffWeeks < 4) {
    return `${diffWeeks} WEEKS AGO`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) {
    return '1 MONTH AGO';
  }

  if (diffMonths < 12) {
    return `${diffMonths} MONTHS AGO`;
  }

  const diffYears = Math.floor(diffDays / 365);
  if (diffYears === 1) {
    return '1 YEAR AGO';
  }

  return `${diffYears} YEARS AGO`;
};

// Event Section Component - shows event banner + all fights inline
// Memoized to prevent re-renders when other events in the list change
const EventSection = memo(function EventSection({ event }: { event: Event }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  // Use fights from event data (loaded via includeFights parameter)
  // Deduplicate fights by ID in case of data issues
  const fights = React.useMemo(() => {
    const allFights = event.fights || [];
    const seen = new Set<string>();
    return allFights.filter((fight: Fight) => {
      if (seen.has(fight.id)) {
        console.warn('[PastEvents] Duplicate fight filtered:', fight.id);
        return false;
      }
      seen.add(fight.id);
      return true;
    });
  }, [event.fights]);

  // Group fights by card section using orderOnCard
  const hasEarlyPrelims = !!event.earlyPrelimStartTime;
  const mainCard = fights.filter((f: Fight) => f.orderOnCard <= 5);
  const prelims = hasEarlyPrelims
    ? fights.filter((f: Fight) => f.orderOnCard > 5 && f.orderOnCard <= 9)
    : fights.filter((f: Fight) => f.orderOnCard > 5);
  const earlyPrelims = hasEarlyPrelims ? fights.filter((f: Fight) => f.orderOnCard > 9) : [];

  const handleFightPress = (fight: Fight) => {
    router.push(`/fight/${fight.id}?mode=completed`);
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.eventSection}>
      {/* Event Header with Banner and Info */}
      <EventBannerCard
        event={event}
        statusBadge={{
          text: 'COMPLETED',
          backgroundColor: '#166534',
          textColor: '#FFFFFF',
        }}
      />

      {/* Fights Container */}
      <View style={styles.fightsContainer}>
            {/* Main Card */}
            {mainCard.length > 0 && (
              <View style={styles.cardSection}>
                {[...mainCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
                  <CompletedFightCard
                    key={fight.id}
                    fight={fight}
                    onPress={handleFightPress}
                    showEvent={false}
                    enableRatingAnimation={true}
                    index={index}
                  />
                ))}
              </View>
            )}

            {/* Preliminary Card */}
            {prelims.length > 0 && (
              <View style={styles.cardSection}>
                <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
                  {/* Center - Title */}
                  <View style={styles.sectionHeaderCenter}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                      PRELIMS
                    </Text>
                  </View>
                </View>
                {[...prelims].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
                  <CompletedFightCard
                    key={fight.id}
                    fight={fight}
                    onPress={handleFightPress}
                    showEvent={false}
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
                  <View style={styles.sectionHeaderCenter}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                      EARLY PRELIMS
                    </Text>
                  </View>
                </View>
                {[...earlyPrelims].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
                  <CompletedFightCard
                    key={fight.id}
                    fight={fight}
                    onPress={handleFightPress}
                    showEvent={false}
                    enableRatingAnimation={true}
                    index={mainCard.length + prelims.length + index}
                  />
                ))}
              </View>
            )}
      </View>
    </View>
  );
});

type ViewMode = 'recent' | 'top-rated';
type TimePeriod = 'week' | 'month' | '3months' | 'year' | 'all';

export default function PastEventsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { isSearchVisible } = useSearch();
  const { selectedOrgs } = useOrgFilter();
  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [topRatedPeriod, setTopRatedPeriod] = useState<TimePeriod>('week');
  const flatListRef = useRef<FlatList>(null);

  // Convert selected orgs to comma-separated string for API
  const promotionsFilter = selectedOrgs.size > 0
    ? Array.from(selectedOrgs).join(',')
    : undefined;

  // Fetch past events with fights included using infinite query for lazy loading
  // Server-side filtering by promotion when filter is active
  const {
    data: eventsData,
    isLoading: eventsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    ['pastEvents', promotionsFilter],
    async ({ pageParam = 1 }) => {
      return apiService.getEvents({
        type: 'past',
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
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      enabled: viewMode === 'recent',
    }
  );

  // Fetch top rated fights (with server-side promotion filtering)
  const { data: topRatedFights, isLoading: topRatedLoading } = useQuery({
    queryKey: ['topRecentFights', isAuthenticated, topRatedPeriod, promotionsFilter],
    queryFn: () => apiService.getTopRecentFights(topRatedPeriod, promotionsFilter),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    enabled: viewMode === 'top-rated',
  });

  // Flatten all pages of events into a single array (already sorted by backend - most recent first)
  // Deduplicate events by ID in case of pagination overlap
  // Note: Filtering is now done server-side via promotions param
  const pastEvents = React.useMemo(() => {
    const events = eventsData?.pages.flatMap(page => page.events) || [];
    const seen = new Set<string>();
    return events.filter((event: Event) => {
      if (seen.has(event.id)) {
        console.warn('[PastEvents] Duplicate event filtered:', event.id, event.name);
        return false;
      }
      seen.add(event.id);
      return true;
    });
  }, [eventsData?.pages]);

  // Handler for loading more events when reaching end of list
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const styles = createStyles(colors);

  // Memoized render function for FlatList - must be before early returns (Rules of Hooks)
  const renderEventSection = useCallback(({ item }: { item: Event }) => (
    <EventSection event={item} />
  ), []);

  // Render function for top rated fights
  const renderTopRatedFight = useCallback(({ item, index }: { item: any; index: number }) => (
    <CompletedFightCard
      key={item.id}
      fight={item}
      onPress={() => router.push(`/fight/${item.id}?mode=completed` as any)}
      showEvent={true}
      index={index}
      showRank={true}
    />
  ), [router]);

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

  // Stable key extractor
  const keyExtractor = useCallback((item: Event) => item.id, []);
  const fightKeyExtractor = useCallback((item: any) => item.id, []);


  // Determine loading state and data based on view mode
  const isLoading = viewMode === 'recent' ? eventsLoading : topRatedLoading;

  // Top rated fights data (filtering is done server-side)
  const topRatedData = React.useMemo(() => {
    return topRatedFights?.data || [];
  }, [topRatedFights?.data]);

  // Scroll to top when filter changes
  const handleFilterChange = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 50);
  }, []);

  // Empty component that shows loading or empty state
  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.inlineLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            {viewMode === 'recent' ? 'Loading events...' : 'Loading top fights...'}
          </Text>
        </View>
      );
    }
    const orgMessage = selectedOrgs.size > 0
      ? ` for ${Array.from(selectedOrgs).join(' or ')}`
      : '';
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>
          {viewMode === 'recent'
            ? `No past events${orgMessage}`
            : `No top rated fights found${orgMessage} for this period`}
        </Text>
      </View>
    );
  }, [isLoading, viewMode, colors, styles, selectedOrgs.size]);

  // Use appropriate data and render function based on view mode
  const listData = viewMode === 'recent' ? pastEvents : topRatedData;
  const renderItem = viewMode === 'recent' ? renderEventSection : renderTopRatedFight;
  const listKeyExtractor = viewMode === 'recent' ? keyExtractor : fightKeyExtractor;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Organization Filter Tabs - Hidden when search is visible */}
      {!isSearchVisible && <OrgFilterTabs onFilterChange={handleFilterChange} />}

      {/* View Mode Tabs - Sticky below org filter, hidden when search is visible */}
      {!isSearchVisible && <View style={styles.viewModeTabs}>
        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'recent' && styles.viewModeTabActive]}
          onPress={() => setViewMode('recent')}
        >
          <Text style={[styles.viewModeTabText, viewMode === 'recent' && styles.viewModeTabTextActive]}>
            Recent Events
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'top-rated' && styles.viewModeTabActive]}
          onPress={() => setViewMode('top-rated')}
        >
          <Text style={[styles.viewModeTabText, viewMode === 'top-rated' && styles.viewModeTabTextActive]}>
            Top Rated Fights
          </Text>
        </TouchableOpacity>
      </View>}

      {/* Search Bar - Shown when search is visible */}
      <SearchBar />

      {/* Time Period Filter - Sticky below view mode tabs (only for Top Rated), hidden when search is visible */}
      {!isSearchVisible && viewMode === 'top-rated' && (
        <View style={styles.timePeriodTabs}>
          <TouchableOpacity
            style={[styles.timePeriodTab, topRatedPeriod === 'week' && styles.timePeriodTabActive]}
            onPress={() => setTopRatedPeriod('week')}
          >
            <Text style={[styles.timePeriodTabText, topRatedPeriod === 'week' && styles.timePeriodTabTextActive]}>
              Past Week
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.timePeriodTab, topRatedPeriod === 'month' && styles.timePeriodTabActive]}
            onPress={() => setTopRatedPeriod('month')}
          >
            <Text style={[styles.timePeriodTabText, topRatedPeriod === 'month' && styles.timePeriodTabTextActive]}>
              Month
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.timePeriodTab, topRatedPeriod === '3months' && styles.timePeriodTabActive]}
            onPress={() => setTopRatedPeriod('3months')}
          >
            <Text style={[styles.timePeriodTabText, topRatedPeriod === '3months' && styles.timePeriodTabTextActive]}>
              3 Mo.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.timePeriodTab, topRatedPeriod === 'year' && styles.timePeriodTabActive]}
            onPress={() => setTopRatedPeriod('year')}
          >
            <Text style={[styles.timePeriodTabText, topRatedPeriod === 'year' && styles.timePeriodTabTextActive]}>
              Year
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.timePeriodTab, topRatedPeriod === 'all' && styles.timePeriodTabActive]}
            onPress={() => setTopRatedPeriod('all')}
          >
            <Text style={[styles.timePeriodTabText, topRatedPeriod === 'all' && styles.timePeriodTabTextActive]}>
              All Time
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={listKeyExtractor}
        ListFooterComponent={viewMode === 'recent' ? ListFooterComponent : null}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onEndReached={viewMode === 'recent' ? handleLoadMore : undefined}
        onEndReachedThreshold={0.5}
        // Disable virtualization optimizations to prevent scroll jumping
        // with variable height items
        removeClippedSubviews={false}
        windowSize={21}
        maxToRenderPerBatch={10}
        initialNumToRender={5}
        // Helps maintain scroll position when content changes
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 80,
  },
  centerContainer: {
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
  eventSection: {
    marginBottom: 32,
  },
  eventHeader: {
    marginBottom: 8,
  },
  eventBanner: {
    width: '100%',
    height: 200,
  },
  eventInfo: {
    padding: 16,
  },
  eventName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
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
  fightsContainer: {
    marginTop: 0,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  cardSection: {
    marginTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
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
    marginLeft: 'auto',
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
    flexWrap: 'nowrap',
    textAlign: 'center',
  },
  viewModeTabs: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  viewModeTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewModeTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  viewModeTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  viewModeTabTextActive: {
    color: '#000000',
  },
  timePeriodTabs: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timePeriodTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  timePeriodTabActive: {
    backgroundColor: colors.tint,
    borderColor: colors.tint,
  },
  timePeriodTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  timePeriodTabTextActive: {
    color: '#000000',
  },
  topRatedColumnHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  inlineLoadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
