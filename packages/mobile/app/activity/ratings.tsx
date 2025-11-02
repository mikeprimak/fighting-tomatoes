import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import FightDisplayCard, { FightData } from '../../components/FightDisplayCardNew';
import RateFightModal from '../../components/RateFightModal';
import { FontAwesome } from '@expo/vector-icons';

type SortOption = 'newest' | 'rating' | 'aggregate' | 'upvotes' | 'rated-1' | 'rated-2' | 'rated-3' | 'rated-4' | 'rated-5' | 'rated-6' | 'rated-7' | 'rated-8' | 'rated-9' | 'rated-10';
type FilterType = 'ratings' | 'hype' | 'comments';

export default function RatingsActivityScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [filterType, setFilterType] = useState<FilterType>('ratings');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showFilterTypeMenu, setShowFilterTypeMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedFight, setSelectedFight] = useState<FightData | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Fetch user's rated fights
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['myRatings', sortBy, filterType],
    queryFn: async () => {
      return apiService.getMyRatings({
        page: '1',
        limit: '50',
        sortBy,
        filterType,
      });
    },
  });

  const handleFightPress = (fight: FightData) => {
    // Close any open dropdowns first
    setShowFilterTypeMenu(false);
    setShowSortMenu(false);

    setSelectedFight(fight);
    setShowRatingModal(true);
  };

  const handleCloseModal = () => {
    setShowRatingModal(false);
    setSelectedFight(null);
    refetch(); // Refresh the list after modal closes
  };

  const filterTypeOptions = [
    { value: 'ratings' as FilterType, label: 'My Ratings', icon: 'star' },
    { value: 'hype' as FilterType, label: 'My Hype', icon: 'fire' },
    { value: 'comments' as FilterType, label: 'My Comments', icon: 'comment' },
  ];

  const sortOptions = [
    { value: 'newest' as SortOption, label: 'Newest First', icon: 'clock-o' },
    { value: 'rating' as SortOption, label: 'My Rating (High to Low)', icon: 'star' },
    { value: 'aggregate' as SortOption, label: 'Community Rating (High to Low)', icon: 'users' },
    { value: 'upvotes' as SortOption, label: 'Most Upvoted Reviews', icon: 'thumbs-up' },
    { value: 'rated-10' as SortOption, label: 'I rated 10', icon: 'star' },
    { value: 'rated-9' as SortOption, label: 'I rated 9', icon: 'star' },
    { value: 'rated-8' as SortOption, label: 'I rated 8', icon: 'star' },
    { value: 'rated-7' as SortOption, label: 'I rated 7', icon: 'star' },
    { value: 'rated-6' as SortOption, label: 'I rated 6', icon: 'star' },
    { value: 'rated-5' as SortOption, label: 'I rated 5', icon: 'star' },
    { value: 'rated-4' as SortOption, label: 'I rated 4', icon: 'star' },
    { value: 'rated-3' as SortOption, label: 'I rated 3', icon: 'star' },
    { value: 'rated-2' as SortOption, label: 'I rated 2', icon: 'star' },
    { value: 'rated-1' as SortOption, label: 'I rated 1', icon: 'star' },
  ];

  const styles = createStyles(colors);

  const renderFilterTypeButton = () => {
    const currentFilterType = filterTypeOptions.find(opt => opt.value === filterType);
    return (
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            setShowFilterTypeMenu(!showFilterTypeMenu);
            setShowSortMenu(false);
          }}
        >
          <FontAwesome name={currentFilterType?.icon as any} size={14} color={colors.text} />
          <Text style={[styles.filterButtonText, { color: colors.text }]}>
            {currentFilterType?.label}
          </Text>
          <FontAwesome name={showFilterTypeMenu ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderSortButton = () => {
    const currentSort = sortOptions.find(opt => opt.value === sortBy);
    return (
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            setShowSortMenu(!showSortMenu);
            setShowFilterTypeMenu(false);
          }}
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
          title: 'My Activity',
          headerStyle: {
            backgroundColor: colors.card,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.container}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading your ratings...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <FontAwesome name="exclamation-triangle" size={48} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>
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
              Start rating fights to see them here!
            </Text>
          </View>
        ) : (
          <View style={styles.contentContainer}>
            {/* Fights List */}
            <FlatList
              data={data.fights}
              keyExtractor={(item: FightData) => item.id}
              renderItem={({ item }) => (
                <View style={styles.fightCardContainer}>
                  <FightDisplayCard
                    fight={item}
                    onPress={handleFightPress}
                    showEvent={true}
                  />
                </View>
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <>
                  <View style={styles.filtersRow}>
                    {renderFilterTypeButton()}
                  </View>
                  <View style={styles.filtersRow}>
                    {renderSortButton()}
                  </View>
                </>
              }
            />

            {/* Filter Type Dropdown Menu */}
            {showFilterTypeMenu && (
              <View style={[styles.overlayMenu, styles.filterTypeMenuPosition, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ScrollView style={styles.menuScrollView}>
                  {filterTypeOptions.map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.filterMenuItem,
                        filterType === option.value && { backgroundColor: colors.backgroundSecondary }
                      ]}
                      onPress={() => {
                        setFilterType(option.value);
                        setShowFilterTypeMenu(false);
                      }}
                    >
                      <FontAwesome name={option.icon as any} size={14} color={colors.text} />
                      <Text style={[styles.filterMenuItemText, { color: colors.text }]}>
                        {option.label}
                      </Text>
                      {filterType === option.value && (
                        <FontAwesome name="check" size={14} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Sort Dropdown Menu */}
            {showSortMenu && (
              <View style={[styles.overlayMenu, styles.sortMenuPosition, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ScrollView style={styles.menuScrollView}>
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
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </SafeAreaView>

      {/* Rating Modal */}
      <RateFightModal
        visible={showRatingModal}
        fight={selectedFight}
        onClose={handleCloseModal}
      />
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
  clearFilterButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  clearFilterButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
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
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 10,
    zIndex: 10,
  },
  filterTypeMenuPosition: {
    top: 110,
    left: 16,
    right: 16,
  },
  sortMenuPosition: {
    top: 165,
    left: 16,
    right: 16,
  },
  menuScrollView: {
    maxHeight: 300,
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
  fightCardContainer: {
    marginBottom: 12,
    paddingHorizontal: 16,
  },
});
