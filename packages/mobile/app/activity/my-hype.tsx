import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { FightData } from '../../components/FightDisplayCardNew';
import UpcomingFightCard from '../../components/fight-cards/UpcomingFightCard';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { getHypeHeatmapColor } from '../../utils/heatmap';

type SortOption = 'newest' | 'highest' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export default function MyHypeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { filter } = useLocalSearchParams<{ filter?: string }>();

  // Determine initial sort option from route param
  const getInitialSortOption = (): SortOption => {
    if (filter && ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].includes(filter)) {
      return filter as SortOption;
    }
    return 'newest';
  };

  const [sortBy, setSortBy] = useState<SortOption>(getInitialSortOption);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Fetch user's hype fights
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['myHype', sortBy],
    queryFn: async () => {
      return apiService.getMyRatings({
        page: '1',
        limit: '50',
        sortBy: sortBy === 'highest' ? 'rating' : 'newest',
        filterType: 'hype',
      });
    },
  });

  // Refetch data when screen comes back into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleFightPress = (fight: FightData) => {
    setShowSortMenu(false);
    router.push(`/fight/${fight.id}` as any);
  };

  const sortOptions: { value: SortOption; label: string; icon?: string; isScoreFilter?: boolean; useFlameIcon?: boolean }[] = [
    { value: 'newest', label: 'New', icon: 'clock-o' },
    { value: 'highest', label: 'My Hype', useFlameIcon: true },
    { value: '10', label: '10', isScoreFilter: true },
    { value: '9', label: '9', isScoreFilter: true },
    { value: '8', label: '8', isScoreFilter: true },
    { value: '7', label: '7', isScoreFilter: true },
    { value: '6', label: '6', isScoreFilter: true },
    { value: '5', label: '5', isScoreFilter: true },
    { value: '4', label: '4', isScoreFilter: true },
    { value: '3', label: '3', isScoreFilter: true },
    { value: '2', label: '2', isScoreFilter: true },
    { value: '1', label: '1', isScoreFilter: true },
  ];

  const styles = createStyles(colors);

  const renderSortButton = () => {
    const currentSort = sortOptions.find(opt => opt.value === sortBy);
    const isScoreFilter = currentSort?.isScoreFilter;
    const scoreValue = isScoreFilter ? parseInt(currentSort.value) : null;

    return (
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowSortMenu(!showSortMenu)}
        >
          {isScoreFilter && scoreValue ? (
            <FontAwesome6 name="fire-flame-curved" size={14} color={getHypeHeatmapColor(scoreValue)} solid />
          ) : currentSort?.useFlameIcon ? (
            <FontAwesome6 name="fire-flame-curved" size={14} color={colors.text} solid />
          ) : (
            <FontAwesome name={currentSort?.icon as any} size={14} color={colors.text} />
          )}
          <Text style={[styles.filterButtonText, { color: colors.text }]}>
            {currentSort?.label}
          </Text>
          <FontAwesome name={showSortMenu ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'My Hype',
          headerStyle: {
            backgroundColor: colors.card,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading your hype scores...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <FontAwesome name="exclamation-triangle" size={48} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>
              Failed to load hype scores
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={() => refetch()}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !data?.fights || data.fights.length === 0 ? (
          <View style={styles.centerContainer}>
            <FontAwesome name="fire" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No Hype Scores Yet
            </Text>
            <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
              Rate how hyped you are for upcoming fights to see them here!
            </Text>
          </View>
        ) : (
          <View style={styles.contentContainer}>
            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header with sort dropdown */}
              <View style={styles.headerContainer}>
                <View style={styles.filtersRow}>
                  {renderSortButton()}
                </View>
                <View style={styles.columnHeadersContainer}>
                  <View style={styles.columnHeadersLeft}>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                      ALL
                    </Text>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                      HYPE
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
              </View>

              {/* Upcoming Fights Section */}
              {(() => {
                // Check if sortBy is a score filter (1-10)
                const isScoreFilter = !isNaN(parseInt(sortBy));
                const scoreFilter = isScoreFilter ? parseInt(sortBy) : null;

                const upcomingFights = data.fights
                  .filter((f: FightData) => {
                    if (f.status !== 'upcoming') return false;
                    // Apply score filter if active
                    if (scoreFilter !== null) {
                      return Math.round(f.userHypePrediction || 0) === scoreFilter;
                    }
                    return true;
                  })
                  .sort((a: FightData, b: FightData) => {
                    if (sortBy === 'highest') {
                      return (b.userHypePrediction || 0) - (a.userHypePrediction || 0);
                    }
                    // Sort by event date ascending (soonest first)
                    const dateA = new Date(a.event.date).getTime();
                    const dateB = new Date(b.event.date).getTime();
                    if (dateA !== dateB) return dateA - dateB;
                    const orderA = a.orderOnCard ?? 999;
                    const orderB = b.orderOnCard ?? 999;
                    return orderA - orderB;
                  });
                return upcomingFights.length > 0 ? (
                  <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Fights</Text>
                    {upcomingFights.map((fight: FightData, index: number) => (
                      <UpcomingFightCard
                        key={fight.id}
                        fight={fight}
                        onPress={handleFightPress}
                        showEvent={true}
                        index={index}
                      />
                    ))}
                  </View>
                ) : null;
              })()}

              {/* Past Fights Section */}
              {(() => {
                // Check if sortBy is a score filter (1-10)
                const isScoreFilter = !isNaN(parseInt(sortBy));
                const scoreFilter = isScoreFilter ? parseInt(sortBy) : null;

                const pastFights = data.fights
                  .filter((f: FightData) => {
                    if (f.status !== 'completed') return false;
                    // Apply score filter if active
                    if (scoreFilter !== null) {
                      return Math.round(f.userHypePrediction || 0) === scoreFilter;
                    }
                    return true;
                  })
                  .sort((a: FightData, b: FightData) => {
                    if (sortBy === 'highest') {
                      return (b.userHypePrediction || 0) - (a.userHypePrediction || 0);
                    }
                    // Sort by event date descending (most recent first)
                    const dateA = new Date(a.event.date).getTime();
                    const dateB = new Date(b.event.date).getTime();
                    if (dateA !== dateB) return dateB - dateA;
                    const orderA = a.orderOnCard ?? 999;
                    const orderB = b.orderOnCard ?? 999;
                    return orderA - orderB;
                  });
                return pastFights.length > 0 ? (
                  <View style={[styles.sectionContainer, { marginTop: 30 }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Past Fights</Text>
                    {pastFights.map((fight: FightData, index: number) => (
                      <UpcomingFightCard
                        key={fight.id}
                        fight={fight}
                        onPress={handleFightPress}
                        showEvent={true}
                        index={index}
                      />
                    ))}
                  </View>
                ) : null;
              })()}
            </ScrollView>

            {/* Sort Dropdown Menu */}
            {showSortMenu && (
              <ScrollView style={[styles.overlayMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {sortOptions.map(option => {
                  const isScoreOption = option.isScoreFilter;
                  const scoreValue = isScoreOption ? parseInt(option.value) : null;

                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.filterMenuItem,
                        sortBy === option.value && { backgroundColor: colors.backgroundSecondary }
                      ]}
                      onPress={() => {
                        setSortBy(option.value);
                        setShowSortMenu(false);
                      }}
                    >
                      {isScoreOption && scoreValue ? (
                        <FontAwesome6 name="fire-flame-curved" size={14} color={getHypeHeatmapColor(scoreValue)} solid />
                      ) : option.useFlameIcon ? (
                        <FontAwesome6 name="fire-flame-curved" size={14} color={colors.text} solid />
                      ) : (
                        <FontAwesome name={option.icon as any} size={14} color={colors.text} />
                      )}
                      <Text style={[styles.filterMenuItemText, { color: colors.text }]}>
                        {option.label}
                      </Text>
                      {sortBy === option.value && (
                        <FontAwesome name="check" size={14} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyDescription: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 300,
  },
  headerContainer: {
    marginTop: 25,
  },
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterContainer: {
    flex: 1,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  filterButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  overlayMenu: {
    position: 'absolute',
    top: 80,
    left: 16,
    right: 16,
    maxHeight: 350,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 10,
    zIndex: 10,
  },
  filterMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  filterMenuItemText: {
    flex: 1,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 16,
  },
  columnHeadersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  columnHeadersLeft: {
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
  sectionContainer: {
    marginTop: -37,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
});
