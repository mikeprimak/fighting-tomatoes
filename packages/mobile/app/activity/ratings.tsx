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

type SortOption = 'newest' | 'rating' | 'aggregate' | 'upvotes';

export default function RatingsActivityScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [tagFilter, setTagFilter] = useState<string | undefined>(undefined);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [selectedFight, setSelectedFight] = useState<FightData | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Fetch user's rated fights
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['myRatings', sortBy, tagFilter],
    queryFn: async () => {
      return apiService.getMyRatings({
        page: '1',
        limit: '50',
        sortBy,
        tagFilter,
      });
    },
  });

  // Extract unique tags from all fights
  const allTags = React.useMemo(() => {
    if (!data?.fights) return [];
    const tagSet = new Set<string>();
    data.fights.forEach((fight: FightData) => {
      if (fight.userTags) {
        fight.userTags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [data?.fights]);

  const handleFightPress = (fight: FightData) => {
    // Close any open dropdowns first
    setShowSortMenu(false);
    setShowTagMenu(false);

    setSelectedFight(fight);
    setShowRatingModal(true);
  };

  const handleCloseModal = () => {
    setShowRatingModal(false);
    setSelectedFight(null);
    refetch(); // Refresh the list after modal closes
  };

  const sortOptions = [
    { value: 'newest' as SortOption, label: 'Newest First', icon: 'clock-o' },
    { value: 'rating' as SortOption, label: 'My Rating (High to Low)', icon: 'star' },
    { value: 'aggregate' as SortOption, label: 'Community Rating (High to Low)', icon: 'users' },
    { value: 'upvotes' as SortOption, label: 'Most Upvoted Reviews', icon: 'thumbs-up' },
  ];

  const styles = createStyles(colors);

  const renderSortButton = () => {
    const currentSort = sortOptions.find(opt => opt.value === sortBy);
    return (
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            setShowSortMenu(!showSortMenu);
            setShowTagMenu(false); // Close tag menu when opening sort menu
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

  const renderTagFilter = () => {
    if (allTags.length === 0) return null;

    return (
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            setShowTagMenu(!showTagMenu);
            setShowSortMenu(false); // Close sort menu when opening tag menu
          }}
        >
          <FontAwesome name="tags" size={14} color={colors.text} />
          <Text style={[styles.filterButtonText, { color: colors.text }]}>
            {tagFilter || 'All Tags'}
          </Text>
          <FontAwesome name={showTagMenu ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textSecondary} />
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
              {tagFilter
                ? `You haven't rated any fights with the "${tagFilter}" tag yet.`
                : 'Start rating fights to see them here!'
              }
            </Text>
            {tagFilter && (
              <TouchableOpacity
                style={[styles.clearFilterButton, { backgroundColor: colors.primary }]}
                onPress={() => setTagFilter(undefined)}
              >
                <Text style={styles.clearFilterButtonText}>Clear Filter</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.contentContainer}>
            {/* Stats Header */}
            <View style={[styles.statsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {data.pagination.total}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Total Fights
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {data.fights.filter((f: FightData) => f.userRating).length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Rated
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {data.fights.filter((f: FightData) => f.userReview).length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Reviewed
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {allTags.length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Tags Used
                </Text>
              </View>
            </View>

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
                <View style={styles.filtersRow}>
                  {renderSortButton()}
                  {renderTagFilter()}
                </View>
              }
            />

            {/* Dropdown Menus - Rendered on top */}
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

            {showTagMenu && allTags.length > 0 && (
              <View style={[styles.overlayMenu, styles.tagMenuPosition, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ScrollView style={styles.menuScrollView}>
                  <TouchableOpacity
                    style={[
                      styles.filterMenuItem,
                      !tagFilter && { backgroundColor: colors.backgroundSecondary }
                    ]}
                    onPress={() => {
                      setTagFilter(undefined);
                      setShowTagMenu(false);
                    }}
                  >
                    <FontAwesome name="times" size={14} color={colors.text} />
                    <Text style={[styles.filterMenuItemText, { color: colors.text }]}>
                      All Tags
                    </Text>
                    {!tagFilter && (
                      <FontAwesome name="check" size={14} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                  {allTags.map(tag => (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.filterMenuItem,
                        tagFilter === tag && { backgroundColor: colors.backgroundSecondary }
                      ]}
                      onPress={() => {
                        setTagFilter(tag);
                        setShowTagMenu(false);
                      }}
                    >
                      <FontAwesome name="tag" size={14} color={colors.text} />
                      <Text style={[styles.filterMenuItemText, { color: colors.text }]}>
                        {tag}
                      </Text>
                      {tagFilter === tag && (
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
  sortMenuPosition: {
    top: 165,
    left: 16,
    right: '50%',
    marginRight: 4,
  },
  tagMenuPosition: {
    top: 165,
    left: '50%',
    right: 16,
    marginLeft: 4,
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
