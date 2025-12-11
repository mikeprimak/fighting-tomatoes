import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { FightData } from '../../components/FightDisplayCardNew';
import CompletedFightCard from '../../components/fight-cards/CompletedFightCard';
import { FontAwesome } from '@expo/vector-icons';

type SortOption = 'newest' | 'highest';

export default function MyRatingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Fetch user's rated fights
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['myRatingsScreen', sortBy],
    queryFn: async () => {
      return apiService.getMyRatings({
        page: '1',
        limit: '50',
        sortBy: sortBy === 'highest' ? 'rating' : 'newest',
        filterType: 'ratings',
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

  const sortOptions = [
    { value: 'newest' as SortOption, label: 'New', icon: 'clock-o' },
    { value: 'highest' as SortOption, label: 'My Rating', icon: 'star' },
  ];

  const styles = createStyles(colors);

  const renderSortButton = () => {
    const currentSort = sortOptions.find(opt => opt.value === sortBy);
    return (
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowSortMenu(!showSortMenu)}
        >
          <FontAwesome name={currentSort?.icon as any} size={14} color={colors.text} />
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
          title: 'My Ratings',
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
              Loading your ratings...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <FontAwesome name="exclamation-triangle" size={48} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>
              Failed to load ratings
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
            <FontAwesome name="star-o" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No Ratings Yet
            </Text>
            <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
              Rate fights to see them here!
            </Text>
          </View>
        ) : (
          <View style={styles.contentContainer}>
            <FlatList
              data={data.fights}
              keyExtractor={(item: FightData) => item.id}
              renderItem={({ item }) => (
                <CompletedFightCard
                  fight={item}
                  onPress={handleFightPress}
                  showEvent={true}
                />
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
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
                        RATINGS
                      </Text>
                    </View>
                    <View style={styles.columnHeadersRight}>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                        MY
                      </Text>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                        RATING
                      </Text>
                    </View>
                  </View>
                </View>
              }
            />

            {/* Sort Dropdown Menu */}
            {showSortMenu && (
              <View style={[styles.overlayMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {sortOptions.map(option => (
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
                    <FontAwesome name={option.icon as any} size={14} color={colors.text} />
                    <Text style={[styles.filterMenuItemText, { color: colors.text }]}>
                      {option.label}
                    </Text>
                    {sortBy === option.value && (
                      <FontAwesome name="check" size={14} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
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
});
