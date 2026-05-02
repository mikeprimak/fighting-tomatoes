import React, { useCallback, memo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { useSearch } from '../../../store/SearchContext';
import { useOrgFilter } from '../../../store/OrgFilterContext';
import CompletedFightCard from '../../../components/fight-cards/CompletedFightCard';
import OrgFilterTabs from '../../../components/OrgFilterTabs';
import SpoilerToggleButton from '../../../components/SpoilerToggleButton';
import { EventBannerCard, SearchBar } from '../../../components';
import { formatEventDate } from '../../../utils/dateFormatters';

// Number of events to load initially and per page
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
  fightStatus: string;
  winner?: string | null;
  method?: string | null;
  round?: number | null;
  time?: string | null;
  averageRating: number;
  userRating?: number;
  userReview?: string;
  userHypePrediction?: number;
}



const formatDate = (dateString: string) => formatEventDate(dateString, { year: true });

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

  // Group fights by card section using cardType from scrapers
  const hasEarlyPrelims = !!event.earlyPrelimStartTime;
  const hasCardTypes = fights.some((f: Fight) => f.cardType);

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
  const prelims = hasCardTypes
    ? fights.filter((f: Fight) => f.cardType && isPrelims(f.cardType))
    : hasEarlyPrelims
      ? fights.filter((f: Fight) => f.orderOnCard > 5 && f.orderOnCard <= 9)
      : fights.filter((f: Fight) => f.orderOnCard > 5);
  const earlyPrelims = hasCardTypes
    ? fights.filter((f: Fight) => f.cardType && isEarlyPrelims(f.cardType))
    : hasEarlyPrelims ? fights.filter((f: Fight) => f.orderOnCard > 9) : [];

  const handleFightPress = React.useCallback((fight: Fight) => {
    router.push(`/fight/${fight.id}?mode=completed`);
  }, [router]);

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
                  {/* Left Column Header - RATING */}
                  <View style={styles.columnHeaders}>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                      RATING
                    </Text>
                  </View>

                  {/* Center - Title */}
                  <View style={styles.sectionHeaderCenter}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                      MAIN CARD
                    </Text>
                  </View>

                  {/* Right Column Header - MY RATING */}
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

export default function PastEventsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isSearchVisible } = useSearch();
  const { selectedOrgs, filterEventsByOrg } = useOrgFilter();
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
    refetch,
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
    }
  );

  // Flatten all pages of events into a single array (already sorted by backend - most recent first)
  // Deduplicate events by ID, then filter out hidden orgs (e.g. Matchroom)
  const pastEvents = React.useMemo(() => {
    const events = eventsData?.pages.flatMap(page => page.events) || [];
    const seen = new Set<string>();
    const deduped = events.filter((event: Event) => {
      if (seen.has(event.id)) {
        console.warn('[PastEvents] Duplicate event filtered:', event.id, event.name);
        return false;
      }
      seen.add(event.id);
      return true;
    });
    return filterEventsByOrg(deduped);
  }, [eventsData?.pages, filterEventsByOrg]);

  // Handler for loading more events when reaching end of list
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const styles = createStyles(colors);

  // Memoized render function for FlatList - must be before early returns (Rules of Hooks)
  const renderEventSection = useCallback(({ item }: { item: Event }) => (
    <EventSection event={item} />
  ), []);

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


  // Scroll to top when filter changes
  const handleFilterChange = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 50);
  }, []);

  // Empty component that shows loading or empty state
  const ListEmptyComponent = useCallback(() => {
    if (eventsLoading) {
      return (
        <View style={styles.inlineLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Loading events...
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
          No past events{orgMessage}
        </Text>
      </View>
    );
  }, [eventsLoading, colors, styles, selectedOrgs.size]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <StatusBar barStyle="light-content" />

      {/* Organization Filter Tabs - Hidden when search is visible */}
      {!isSearchVisible && (
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            <OrgFilterTabs onFilterChange={handleFilterChange} />
          </View>
          <SpoilerToggleButton />
        </View>
      )}

      {/* Search Bar - Shown when search is visible */}
      <SearchBar />

      <FlatList
        ref={flatListRef}
        data={pastEvents}
        renderItem={renderEventSection}
        keyExtractor={keyExtractor}
        ListFooterComponent={ListFooterComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor="#181818"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        // Virtualization settings - keep render window small so off-screen
        // items are unmounted as more pages lazy-load in
        removeClippedSubviews={true}
        windowSize={5}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={100}
        initialNumToRender={3}
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
