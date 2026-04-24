import React, { useCallback, useState, useRef } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { useAuth } from '../../../store/AuthContext';
import { useSearch } from '../../../store/SearchContext';
import { useOrgFilter } from '../../../store/OrgFilterContext';
import CompletedFightCard from '../../../components/fight-cards/CompletedFightCard';
import OrgFilterTabs from '../../../components/OrgFilterTabs';
import { SearchBar } from '../../../components';

type TimePeriod = 'week' | 'month' | '3months' | 'year' | 'all';

export default function TopFightsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { isSearchVisible } = useSearch();
  const { selectedOrgs } = useOrgFilter();
  const [topRatedPeriod, setTopRatedPeriod] = useState<TimePeriod>('week');
  const flatListRef = useRef<FlatList>(null);

  // Convert selected orgs to comma-separated string for API
  const promotionsFilter = selectedOrgs.size > 0
    ? Array.from(selectedOrgs).join(',')
    : undefined;

  // Fetch top rated fights (with server-side promotion filtering)
  const { data: topRatedFights, isLoading, refetch } = useQuery({
    queryKey: ['topRecentFights', isAuthenticated, topRatedPeriod, promotionsFilter],
    queryFn: () => apiService.getTopRecentFights(topRatedPeriod, promotionsFilter),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  // Top rated fights data - filter out hidden orgs client-side
  const topRatedData = React.useMemo(() => {
    const fights = topRatedFights?.data || [];
    return fights.filter((fight: any) => {
      const promotion = (fight.event?.promotion || '').toUpperCase();
      return !promotion.includes('MATCHROOM');
    });
  }, [topRatedFights?.data]);

  // Scroll to top when filter changes
  const handleFilterChange = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 50);
  }, []);

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

  const fightKeyExtractor = useCallback((item: any) => item.id, []);

  const styles = createStyles(colors);

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.inlineLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Loading top fights...
          </Text>
        </View>
      );
    }
    const orgMessage = selectedOrgs.size > 0
      ? ` for ${Array.from(selectedOrgs).join(' or ')}`
      : '';
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.noFightsText, { color: colors.textSecondary }]}>
          No top rated fights found{orgMessage} for this period
        </Text>
      </View>
    );
  }, [isLoading, colors, styles, selectedOrgs.size]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <StatusBar barStyle="light-content" />

      {/* Organization Filter Tabs - Hidden when search is visible */}
      {!isSearchVisible && <OrgFilterTabs onFilterChange={handleFilterChange} />}

      {/* Search Bar - Shown when search is visible */}
      <SearchBar />

      {/* Time Period Filter - Hidden when search is visible */}
      {!isSearchVisible && (
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
        data={topRatedData}
        renderItem={renderTopRatedFight}
        keyExtractor={fightKeyExtractor}
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
          />
        }
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
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  noFightsText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
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
});
