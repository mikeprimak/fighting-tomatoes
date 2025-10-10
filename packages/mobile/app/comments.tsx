import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { CommentCard } from '../components';

type SortOption = 'top-recent' | 'top-all-time' | 'new';

export default function CommentsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [sortBy, setSortBy] = useState<SortOption>('top-recent');
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);

  // Fetch comments based on sort option
  const { data: commentsData, isLoading } = useQuery({
    queryKey: ['comments', sortBy],
    queryFn: () => apiService.getComments(sortBy),
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  // Upvote mutation
  const upvoteMutation = useMutation({
    mutationFn: ({ fightId, reviewId }: { fightId: string; reviewId: string }) =>
      apiService.toggleReviewUpvote(fightId, reviewId),
    onMutate: async ({ reviewId }) => {
      setUpvotingCommentId(reviewId);

      await queryClient.cancelQueries({ queryKey: ['comments', sortBy] });
      const previousComments = queryClient.getQueryData(['comments', sortBy]);

      queryClient.setQueryData(['comments', sortBy], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((comment: any) =>
            comment.id === reviewId
              ? {
                  ...comment,
                  userHasUpvoted: !comment.userHasUpvoted,
                  upvotes: comment.userHasUpvoted ? comment.upvotes - 1 : comment.upvotes + 1,
                }
              : comment
          ),
        };
      });

      return { previousComments };
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['comments', sortBy], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((comment: any) =>
            comment.id === variables.reviewId
              ? {
                  ...comment,
                  userHasUpvoted: data.isUpvoted,
                  upvotes: data.upvotesCount,
                }
              : comment
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['topComments'] });
    },
    onError: (err, variables, context: any) => {
      if (context?.previousComments) {
        queryClient.setQueryData(['comments', sortBy], context.previousComments);
      }
    },
    onSettled: () => {
      setUpvotingCommentId(null);
    },
  });

  const handleSortChange = (option: SortOption) => {
    setSortBy(option);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <TouchableOpacity
          style={[
            styles.sortButton,
            sortBy === 'top-recent' && { backgroundColor: colors.tint },
          ]}
          onPress={() => handleSortChange('top-recent')}
        >
          <Text
            style={[
              styles.sortButtonText,
              { color: sortBy === 'top-recent' ? '#000' : colors.text },
            ]}
          >
            Top Recent
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.sortButton,
            sortBy === 'top-all-time' && { backgroundColor: colors.tint },
          ]}
          onPress={() => handleSortChange('top-all-time')}
        >
          <Text
            style={[
              styles.sortButtonText,
              { color: sortBy === 'top-all-time' ? '#000' : colors.text },
            ]}
          >
            Top All Time
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.sortButton,
            sortBy === 'new' && { backgroundColor: colors.tint },
          ]}
          onPress={() => handleSortChange('new')}
        >
          <Text
            style={[
              styles.sortButtonText,
              { color: sortBy === 'new' ? '#000' : colors.text },
            ]}
          >
            New
          </Text>
        </TouchableOpacity>
      </View>

      {/* Comments List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={commentsData?.data || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CommentCard
              comment={item}
              onPress={() => router.push(`/fight/${item.fight.id}` as any)}
              onUpvote={() => upvoteMutation.mutate({ fightId: item.fight.id, reviewId: item.id })}
              isUpvoting={upvotingCommentId === item.id}
              isAuthenticated={isAuthenticated}
            />
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No comments yet
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sortContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 12,
    marginTop: -20,
    gap: 8,
  },
  sortButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
});
