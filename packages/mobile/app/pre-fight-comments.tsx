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
import { router, Stack } from 'expo-router';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { PreFightCommentCard } from '../components/PreFightCommentCard';
import { FlagReviewModal, CustomAlert } from '../components';
import { useCustomAlert } from '../hooks/useCustomAlert';

type SortOption = 'top-recent' | 'top-all-time' | 'new';

export default function PreFightCommentsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();

  const [sortBy, setSortBy] = useState<SortOption>('top-recent');
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [commentToFlag, setCommentToFlag] = useState<{ fightId: string; commentId: string } | null>(null);

  // Fetch pre-fight comments based on sort option
  const { data: commentsData, isLoading } = useQuery({
    queryKey: ['preFightComments', sortBy, isAuthenticated],
    queryFn: () => apiService.getPreFightComments(sortBy),
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  // Upvote mutation
  const upvoteMutation = useMutation({
    mutationFn: ({ fightId, commentId }: { fightId: string; commentId: string }) =>
      apiService.togglePreFightCommentUpvote(fightId, commentId),
    onMutate: async ({ commentId }) => {
      setUpvotingCommentId(commentId);

      await queryClient.cancelQueries({ queryKey: ['preFightComments', sortBy] });
      const previousComments = queryClient.getQueryData(['preFightComments', sortBy]);

      queryClient.setQueryData(['preFightComments', sortBy, isAuthenticated], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((comment: any) =>
            comment.id === commentId
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
      queryClient.setQueryData(['preFightComments', sortBy, isAuthenticated], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((comment: any) =>
            comment.id === variables.commentId
              ? {
                  ...comment,
                  userHasUpvoted: data.userHasUpvoted,
                  upvotes: data.upvotes,
                }
              : comment
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['topPreFightComments'] });
    },
    onError: (err, variables, context: any) => {
      if (context?.previousComments) {
        queryClient.setQueryData(['preFightComments', sortBy, isAuthenticated], context.previousComments);
      }
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

  const handleSortChange = (option: SortOption) => {
    setSortBy(option);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Pre-Fight Comments' }} />
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
            <PreFightCommentCard
              comment={item}
              onUpvote={() => upvoteMutation.mutate({ fightId: item.fight.id, commentId: item.id })}
              onFlag={() => handleFlagComment(item.fight.id, item.id)}
              isUpvoting={upvotingCommentId === item.id}
              isFlagging={flagCommentMutation.isPending && commentToFlag?.commentId === item.id}
              isAuthenticated={isAuthenticated}
            />
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No pre-fight comments yet
              </Text>
            </View>
          }
        />
      )}
      </SafeAreaView>

      {/* Modals */}
      <FlagReviewModal
        visible={flagModalVisible}
        onClose={() => setFlagModalVisible(false)}
        onSubmit={submitFlagComment}
        isLoading={flagCommentMutation.isPending}
        colorScheme={colorScheme}
      />

      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </>
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
