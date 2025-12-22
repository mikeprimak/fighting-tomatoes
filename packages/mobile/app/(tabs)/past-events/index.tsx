import React, { useCallback, memo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Image,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { useAuth } from '../../../store/AuthContext';
import { useSearch } from '../../../store/SearchContext';
import CompletedFightCard from '../../../components/fight-cards/CompletedFightCard';
import { EventBannerCard } from '../../../components';

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

// Parse event name into two lines
const parseEventName = (eventName: string) => {
  const colonMatch = eventName.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    return {
      line1: colonMatch[1].trim(),
      line2: colonMatch[2].replace(/\./g, '').trim(),
    };
  }

  const fightNightMatch = eventName.match(/^(UFC Fight Night)\s+(.+)$/i);
  if (fightNightMatch) {
    return {
      line1: fightNightMatch[1],
      line2: fightNightMatch[2].replace(/\./g, '').trim(),
    };
  }

  const numberedMatch = eventName.match(/^(UFC\s+\d+)\s*(.*)$/i);
  if (numberedMatch) {
    return {
      line1: numberedMatch[1],
      line2: numberedMatch[2].replace(/\./g, '').trim() || '',
    };
  }

  return {
    line1: eventName,
    line2: '',
  };
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

  const { line1, line2 } = parseEventName(event.name);

  const handleFightPress = (fight: Fight) => {
    router.push(`/fight/${fight.id}`);
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
                <View style={styles.sectionHeader}>
                  {/* Left Column Header - ALL / RATINGS */}
                  <View style={styles.columnHeaders}>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                      ALL
                    </Text>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                      RATINGS
                    </Text>
                  </View>

                  {/* Center - Title */}
                  <View style={styles.sectionHeaderCenter}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                      MAIN CARD
                    </Text>
                  </View>

                  {/* Right Column Header - MY / RATING */}
                  <View style={styles.columnHeadersRight}>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                      MY
                    </Text>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                      RATING
                    </Text>
                  </View>
                </View>
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
  const { isSearchVisible, hideSearch } = useSearch();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [topRatedPeriod, setTopRatedPeriod] = useState<TimePeriod>('week');

  const handleSearch = () => {
    Keyboard.dismiss();
    if (searchQuery.trim().length >= 2) {
      router.push(`/search-results?q=${encodeURIComponent(searchQuery.trim())}` as any);
    }
  };

  // Fetch past events with fights included using infinite query for lazy loading
  const {
    data: eventsData,
    isLoading: eventsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    ['pastEvents'],
    async ({ pageParam = 1 }) => {
      return apiService.getEvents({
        type: 'past',
        includeFights: true,
        page: pageParam,
        limit: EVENTS_PER_PAGE,
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

  // Fetch top rated fights
  const { data: topRatedFights, isLoading: topRatedLoading } = useQuery({
    queryKey: ['topRecentFights', isAuthenticated, topRatedPeriod],
    queryFn: () => apiService.getTopRecentFights(topRatedPeriod),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    enabled: viewMode === 'top-rated',
  });

  // Flatten all pages of events into a single array (already sorted by backend - most recent first)
  // Deduplicate events by ID in case of pagination overlap
  const pastEvents = React.useMemo(() => {
    const allEvents = eventsData?.pages.flatMap(page => page.events) || [];
    const seen = new Set<string>();
    return allEvents.filter((event: Event) => {
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
      onPress={() => router.push(`/fight/${item.id}` as any)}
      showEvent={true}
      index={index}
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

  // Header component with search bar and nav tabs
  const ListHeaderComponent = (
    <View>
      {/* Search Bar - only shown when isSearchVisible is true */}
      {isSearchVisible && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBarWrapper}>
            <View style={styles.searchInputContainer}>
              <FontAwesome
                name="search"
                size={18}
                color={colors.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search fighters, events..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoFocus={true}
              />
            </View>
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleSearch}
              disabled={searchQuery.trim().length < 2}
            >
              <Text style={styles.searchButtonText}>Search</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* View Mode Tabs */}
      <View style={styles.viewModeTabs}>
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
      </View>

      {/* Time Period Filter (only for Top Rated) */}
      {viewMode === 'top-rated' && (
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

      {/* Column headers for Top Rated view */}
      {viewMode === 'top-rated' && (
        <View style={styles.topRatedColumnHeaders}>
          <View style={styles.columnHeaders}>
            <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>ALL</Text>
            <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATINGS</Text>
          </View>
          <View style={styles.columnHeadersRight}>
            <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>MY</Text>
            <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATING</Text>
          </View>
        </View>
      )}
    </View>
  );

  // Determine loading state and data based on view mode
  const isLoading = viewMode === 'recent' ? eventsLoading : topRatedLoading;
  const topRatedData = topRatedFights?.data || [];

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
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>
          {viewMode === 'recent' ? 'No past events' : 'No top rated fights found for this period'}
        </Text>
      </View>
    );
  }, [isLoading, viewMode, colors, styles]);

  // Use appropriate data and render function based on view mode
  const listData = viewMode === 'recent' ? pastEvents : topRatedData;
  const renderItem = viewMode === 'recent' ? renderEventSection : renderTopRatedFight;
  const listKeyExtractor = viewMode === 'recent' ? keyExtractor : fightKeyExtractor;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={listKeyExtractor}
        ListHeaderComponent={ListHeaderComponent}
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
    marginTop: 8,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  cardSection: {
    marginTop: 8,
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
  searchContainer: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    height: 44,
  },
  searchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '600',
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
