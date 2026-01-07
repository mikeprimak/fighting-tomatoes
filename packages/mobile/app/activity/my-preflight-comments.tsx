import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { PreFightCommentCard, FlagReviewModal, CustomAlert } from '../../components';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

type SortOption = 'newest' | 'upvotes';
const PAGE_SIZE = 15;

// Type for the API response
type PreflightCommentsPage = {
  comments: Array<{
    id: string;
    fightId: string;
    content: string;
    hypeRating: number | null;
    predictedWinner: string | null;
    upvotes: number;
    userHasUpvoted: boolean;
    createdAt: string;
    isReply: boolean;
    fight: {
      id: string;
      fighter1Id: string;
      fighter2Id: string;
      fighter1Name: string;
      fighter2Name: string;
      eventName: string;
      eventDate: string;
    };
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export default function MyPreflightCommentsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [commentToFlag, setCommentToFlag] = useState<{ fightId: string; commentId: string } | null>(null);
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);

  // Fetch user's pre-flight comments with infinite scroll
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isRefetching,
  } = useInfiniteQuery(
    ['myPreflightComments', sortBy],
    async ({ pageParam = 1 }) => {
      return apiService.getMyPreflightComments({
        page: pageParam as number,
        limit: PAGE_SIZE,
        sortBy,
      });
    },
    {
      getNextPageParam: (lastPage: PreflightCommentsPage) => {
        const { page, totalPages } = lastPage.pagination || { page: 1, totalPages: 1 };
        return page < totalPages ? page + 1 : undefined;
      },
    }
  );

  // Flatten all pages into a single array of comments
  const allComments = (data?.pages as PreflightCommentsPage[] | undefined)?.flatMap(page => page.comments || []) || [];

  // Load more when reaching the end
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Upvote mutation for pre-flight comments
  const upvoteMutation = useMutation({
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

  // Flag comment mutation
  const flagCommentMutation = useMutation({
    mutationFn: ({ fightId, commentId, reason }: { fightId: string; commentId: string; reason: string }) =>
      apiService.flagPreFightComment(fightId, commentId, reason),
    onSuccess: () => {
      showSuccess('Comment has been flagged for moderation');
      setFlagModalVisible(false);
      setCommentToFlag(null);
    },
    onError: (error: any) => {
      showError(error?.error || 'Failed to flag comment');
    },
  });

  const handleFlagComment = (fightId: string, commentId: string) => {
    setCommentToFlag({ fightId, commentId });
    setFlagModalVisible(true);
  };

  const submitFlagComment = (reason: string) => {
    if (commentToFlag) {
      flagCommentMutation.mutate({
        fightId: commentToFlag.fightId,
        commentId: commentToFlag.commentId,
        reason
      });
    }
  };

  const sortOptions = [
    { value: 'newest' as SortOption, label: 'New', icon: 'clock-o' },
    { value: 'upvotes' as SortOption, label: 'Most Upvotes', icon: 'thumbs-up' },
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
          title: 'My Comments (Pre-Fight)',
          headerStyle: {
            backgroundColor: colors.card,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitleVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 16 }}>
              <FontAwesome name="chevron-left" size={20} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading your comments...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <FontAwesome name="exclamation-triangle" size={48} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>
              Failed to load comments
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={() => refetch()}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : allComments.length === 0 ? (
          <View style={styles.centerContainer}>
            <FontAwesome name="comment-o" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No Comments Yet
            </Text>
            <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
              Write comments on upcoming fights to see them here!
            </Text>
          </View>
        ) : (
          <View style={styles.contentContainer}>
            <FlatList
              data={allComments}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              renderItem={({ item: comment }) => (
                <View style={styles.fightCardContainer}>
                  <PreFightCommentCard
                    comment={{
                      id: comment.id,
                      content: comment.content,
                      hypeRating: comment.hypeRating,
                      predictedWinner: comment.predictedWinner,
                      upvotes: comment.upvotes,
                      userHasUpvoted: comment.userHasUpvoted,
                      user: { displayName: 'Me' },
                      fight: {
                        id: comment.fightId,
                        fighter1Name: comment.fight.fighter1Name,
                        fighter2Name: comment.fight.fighter2Name,
                        eventName: comment.fight.eventName,
                      }
                    }}
                    fighter1Id={comment.fight.fighter1Id}
                    fighter2Id={comment.fight.fighter2Id}
                    fighter1Name={comment.fight.fighter1Name}
                    fighter2Name={comment.fight.fighter2Name}
                    onPress={() => router.push(`/fight/${comment.fightId}` as any)}
                    onUpvote={() => upvoteMutation.mutate({ fightId: comment.fightId, commentId: comment.id })}
                    onFlag={() => handleFlagComment(comment.fightId, comment.id)}
                    isUpvoting={upvotingCommentId === comment.id}
                    isFlagging={flagCommentMutation.isPending && commentToFlag?.commentId === comment.id}
                    isAuthenticated={isAuthenticated}
                    showMyComment={true}
                  />
                </View>
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching && !isFetchingNextPage}
                  onRefresh={() => refetch()}
                  tintColor={colors.primary}
                />
              }
              ListHeaderComponent={
                <View style={styles.headerContainer}>
                  <View style={styles.filtersRow}>
                    {renderSortButton()}
                  </View>
                </View>
              }
              ListFooterComponent={
                isFetchingNextPage ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null
              }
            />

            {/* Sort Dropdown Menu */}
            {showSortMenu && (
              <View style={[styles.overlayMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
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

      {/* Flag Comment Modal */}
      <FlagReviewModal
        visible={flagModalVisible}
        onClose={() => setFlagModalVisible(false)}
        onSubmit={submitFlagComment}
        isLoading={flagCommentMutation.isPending}
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
    top: 75,
    left: 16,
    right: 16,
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
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
