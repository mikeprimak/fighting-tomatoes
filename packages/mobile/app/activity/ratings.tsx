import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { FightData } from '../../components/FightDisplayCardNew';
import UpcomingFightCard from '../../components/fight-cards/UpcomingFightCard';
import CompletedFightCard from '../../components/fight-cards/CompletedFightCard';
import { CommentCard, FlagReviewModal, CustomAlert } from '../../components';
import { PreFightCommentCard } from '../../components/PreFightCommentCard';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

type SortOption = 'newest' | 'rating' | 'aggregate' | 'upvotes' | 'rated-1' | 'rated-2' | 'rated-3' | 'rated-4' | 'rated-5' | 'rated-6' | 'rated-7' | 'rated-8' | 'rated-9' | 'rated-10';
type FilterType = 'ratings' | 'hype' | 'comments' | 'preFightComments';

export default function RatingsActivityScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();
  const [filterType, setFilterType] = useState<FilterType>('ratings');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showFilterTypeMenu, setShowFilterTypeMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [reviewToFlag, setReviewToFlag] = useState<{ fightId: string; reviewId: string } | null>(null);
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);

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

  // Refetch data when screen comes back into focus (e.g., after navigating back from fight detail)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleFightPress = (fight: FightData) => {
    // Close any open dropdowns first
    setShowFilterTypeMenu(false);
    setShowSortMenu(false);

    // Navigate to fight detail screen (handles both upcoming and completed fights)
    router.push(`/fight/${fight.id}` as any);
  };

  // Upvote mutation for comments (FightReview)
  const upvoteMutation = useMutation({
    mutationFn: ({ fightId, reviewId }: { fightId: string; reviewId: string }) =>
      apiService.toggleReviewUpvote(fightId, reviewId),
    onMutate: async ({ reviewId }) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setUpvotingCommentId(reviewId);
    },
    onSuccess: () => {
      refetch();
    },
    onSettled: () => {
      setUpvotingCommentId(null);
    },
  });

  // Upvote mutation for pre-fight comments
  const preFightUpvoteMutation = useMutation({
    mutationFn: ({ fightId, commentId }: { fightId: string; commentId: string }) =>
      apiService.togglePreFightCommentUpvote(fightId, commentId),
    onMutate: async ({ commentId }) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setUpvotingCommentId(commentId);
    },
    onSuccess: () => {
      refetch();
    },
    onSettled: () => {
      setUpvotingCommentId(null);
    },
  });

  // Flag review mutation for comments
  const flagReviewMutation = useMutation({
    mutationFn: ({ fightId, reviewId, reason }: { fightId: string; reviewId: string; reason: string }) =>
      apiService.flagReview(fightId, reviewId, reason),
    onSuccess: () => {
      showSuccess('Review has been flagged for moderation');
      setFlagModalVisible(false);
      setReviewToFlag(null);
    },
    onError: (error: any) => {
      showError(error?.error || 'Failed to flag review');
    },
  });

  const handleFlagReview = (fightId: string, reviewId: string) => {
    setReviewToFlag({ fightId, reviewId });
    setFlagModalVisible(true);
  };

  const submitFlagReview = (reason: string) => {
    if (reviewToFlag) {
      flagReviewMutation.mutate({
        fightId: reviewToFlag.fightId,
        reviewId: reviewToFlag.reviewId,
        reason
      });
    }
  };

  const filterTypeOptions = [
    { value: 'ratings' as FilterType, label: 'My Ratings', icon: 'star' },
    { value: 'hype' as FilterType, label: 'My Hype', icon: 'fire' },
    { value: 'comments' as FilterType, label: 'My Comments', icon: 'comment' },
    { value: 'preFightComments' as FilterType, label: 'My Pre-Fight Comments', icon: 'comments' },
  ];

  // Sort options change based on filter type
  const sortOptions = React.useMemo(() => {
    if (filterType === 'comments' || filterType === 'preFightComments') {
      return [
        { value: 'newest' as SortOption, label: 'Newest First', icon: 'clock-o' },
        { value: 'upvotes' as SortOption, label: 'Most Upvotes', icon: 'thumbs-up' },
      ];
    }

    if (filterType === 'hype') {
      return [
        { value: 'newest' as SortOption, label: 'Newest First', icon: 'clock-o' },
        { value: 'rating' as SortOption, label: 'My Hype (High to Low)', icon: 'fire' },
        { value: 'aggregate' as SortOption, label: 'Community Hype (High to Low)', icon: 'users' },
        { value: 'rated-10' as SortOption, label: 'I hyped 10', icon: 'fire' },
        { value: 'rated-9' as SortOption, label: 'I hyped 9', icon: 'fire' },
        { value: 'rated-8' as SortOption, label: 'I hyped 8', icon: 'fire' },
        { value: 'rated-7' as SortOption, label: 'I hyped 7', icon: 'fire' },
        { value: 'rated-6' as SortOption, label: 'I hyped 6', icon: 'fire' },
        { value: 'rated-5' as SortOption, label: 'I hyped 5', icon: 'fire' },
        { value: 'rated-4' as SortOption, label: 'I hyped 4', icon: 'fire' },
        { value: 'rated-3' as SortOption, label: 'I hyped 3', icon: 'fire' },
        { value: 'rated-2' as SortOption, label: 'I hyped 2', icon: 'fire' },
        { value: 'rated-1' as SortOption, label: 'I hyped 1', icon: 'fire' },
      ];
    }

    return [
      { value: 'newest' as SortOption, label: 'Newest First', icon: 'clock-o' },
      { value: 'rating' as SortOption, label: 'My Rating (High to Low)', icon: 'star' },
      { value: 'aggregate' as SortOption, label: 'Community Rating (High to Low)', icon: 'users' },
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
  }, [filterType]);

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
            {filterType === 'hype' ? (
              // Render separate sections for upcoming and completed fights when showing hype
              <ScrollView
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Header with filters */}
                <View style={styles.headerContainer}>
                  <View style={styles.filtersRow}>
                    {renderFilterTypeButton()}
                  </View>
                  <View style={styles.filtersRow}>
                    {renderSortButton()}
                  </View>
                  <View style={styles.columnHeadersContainer}>
                    <View style={styles.columnHeadersUpcoming}>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                        ALL
                      </Text>
                      <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                        HYPE
                      </Text>
                    </View>
                    <View style={styles.columnHeadersUpcomingRight}>
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
                  const upcomingFights = data.fights
                    .filter((f: FightData) => f.status === 'upcoming')
                    .sort((a, b) => {
                      // Sort by event date ascending (soonest first)
                      const dateA = new Date(a.event.date).getTime();
                      const dateB = new Date(b.event.date).getTime();
                      if (dateA !== dateB) {
                        return dateA - dateB;
                      }

                      // If same date, group by event
                      if (a.event.id !== b.event.id) {
                        return a.event.id.localeCompare(b.event.id);
                      }

                      // If same event, sort by orderOnCard descending (main event first)
                      const orderA = a.orderOnCard ?? 999;
                      const orderB = b.orderOnCard ?? 999;
                      return orderA - orderB;
                    });
                  return upcomingFights.length > 0 ? (
                    <View style={styles.sectionContainer}>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Fights</Text>
                      {upcomingFights.map((fight: FightData) => (
                        <UpcomingFightCard
                          key={fight.id}
                          fight={fight}
                          onPress={handleFightPress}
                          showEvent={true}
                        />
                      ))}
                    </View>
                  ) : null;
                })()}

                {/* Past Fights Section */}
                {(() => {
                  const pastFights = data.fights
                    .filter((f: FightData) => f.status === 'completed')
                    .sort((a, b) => {
                      // Sort by event date descending (most recent first)
                      const dateA = new Date(a.event.date).getTime();
                      const dateB = new Date(b.event.date).getTime();
                      if (dateA !== dateB) {
                        return dateB - dateA;
                      }

                      // If same date, group by event
                      if (a.event.id !== b.event.id) {
                        return a.event.id.localeCompare(b.event.id);
                      }

                      // If same event, sort by orderOnCard descending (main event first)
                      const orderA = a.orderOnCard ?? 999;
                      const orderB = b.orderOnCard ?? 999;
                      return orderA - orderB;
                    });
                  return pastFights.length > 0 ? (
                    <View style={styles.sectionContainer}>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>Past Fights</Text>
                      {pastFights.map((fight: FightData) => (
                        <UpcomingFightCard
                          key={fight.id}
                          fight={fight}
                          onPress={handleFightPress}
                          showEvent={true}
                        />
                      ))}
                    </View>
                  ) : null;
                })()}
              </ScrollView>
            ) : (
              <FlatList
                data={data.fights}
                keyExtractor={(item: FightData) => item.id}
                renderItem={({ item }) => {
                  // Render rating cards without wrapper (to extend to edges like community screen)
                  if (filterType === 'ratings') {
                    return (
                      <CompletedFightCard
                        fight={item}
                        onPress={handleFightPress}
                        showEvent={true}
                      />
                    );
                  }

                  // Render comment cards with wrapper (only for comments filter)
                  // Use userReviews (plural) to show all reviews including replies
                  if (filterType === 'comments' && item.userReviews && item.userReviews.length > 0) {
                    return (
                      <View>
                        {item.userReviews.map((review: any) => (
                          <View key={review.id} style={styles.fightCardContainer}>
                            <CommentCard
                              comment={{
                                ...review,
                                user: {
                                  displayName: 'Me'
                                },
                                userHasUpvoted: review.userHasUpvoted || false,
                                fight: {
                                  id: item.id,
                                  fighter1Name: `${item.fighter1.firstName} ${item.fighter1.lastName}`,
                                  fighter2Name: `${item.fighter2.firstName} ${item.fighter2.lastName}`,
                                  eventName: item.event.name,
                                }
                              }}
                              onPress={() => router.push(`/fight/${item.id}` as any)}
                              onUpvote={() => upvoteMutation.mutate({ fightId: item.id, reviewId: review.id })}
                              onFlag={() => handleFlagReview(item.id, review.id)}
                              isUpvoting={upvotingCommentId === review.id}
                              isFlagging={flagReviewMutation.isPending && reviewToFlag?.reviewId === review.id}
                              isAuthenticated={isAuthenticated}
                              showMyReview={true}
                            />
                          </View>
                        ))}
                      </View>
                    );
                  }

                  // Render pre-fight comment cards
                  if (filterType === 'preFightComments' && item.preFightComments && item.preFightComments.length > 0) {
                    return (
                      <View>
                        {item.preFightComments.map((comment: any) => (
                          <View key={comment.id} style={styles.fightCardContainer}>
                            <PreFightCommentCard
                              comment={{
                                ...comment,
                                user: {
                                  displayName: 'Me'
                                },
                                userHasUpvoted: comment.votes && comment.votes.length > 0,
                                fight: {
                                  id: item.id,
                                  fighter1Name: `${item.fighter1.firstName} ${item.fighter1.lastName}`,
                                  fighter2Name: `${item.fighter2.firstName} ${item.fighter2.lastName}`,
                                  eventName: item.event.name,
                                }
                              }}
                              onPress={() => router.push(`/fight/${item.id}` as any)}
                              onUpvote={() => preFightUpvoteMutation.mutate({ fightId: item.id, commentId: comment.id })}
                              isUpvoting={upvotingCommentId === comment.id}
                              isAuthenticated={isAuthenticated}
                              showMyComment={true}
                            />
                          </View>
                        ))}
                      </View>
                    );
                  }

                  return null;
                }}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                  <View style={styles.headerContainer}>
                    <View style={styles.filtersRow}>
                      {renderFilterTypeButton()}
                    </View>
                    <View style={styles.filtersRow}>
                      {renderSortButton()}
                    </View>
                    {filterType === 'ratings' && (
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
                    )}
                  </View>
                }
              />
            )}

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

      {/* Flag Review Modal */}
      <FlagReviewModal
        visible={flagModalVisible}
        onClose={() => setFlagModalVisible(false)}
        onSubmit={submitFlagReview}
        isLoading={flagReviewMutation.isPending}
        colorScheme={colorScheme}
      />

      {/* Custom Alert */}
      <CustomAlert {...alertState} onDismiss={hideAlert} />
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
  headerContainer: {
    marginTop: 25,
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
    marginLeft: -14,
    width: 60,
    justifyContent: 'center',
  },
  columnHeadersRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginRight: -17,
    width: 60,
    justifyContent: 'center',
  },
  columnHeadersUpcoming: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginLeft: -11,
    width: 40,
    justifyContent: 'center',
  },
  columnHeadersUpcomingRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginRight: -11,
    width: 40,
    justifyContent: 'center',
  },
  columnHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionContainer: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginLeft: 16,
  },
});
