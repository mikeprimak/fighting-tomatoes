import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '../../constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FontAwesome6 } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { CommentCard } from '../../components';
import { useAuth } from '../../store/AuthContext';

interface Event {
  id: string;
  name: string;
  date: string;
  venue?: string;
  location?: string;
  promotion: string;
  hasStarted: boolean;
  isComplete: boolean;
}

/**
 * Community Hub - Central page for community-wide data and engagement
 *
 * Features:
 * - Community predictions for upcoming events
 * - Ratings for recent events
 * - Top comments
 * - Top fights list
 * - Top fighters list
 * - Tag lists (best back-and-forth fights, etc.)
 * - Leaderboards (most accurate predictions, etc.)
 */
export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);

  // Fetch events from API
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiService.getEvents(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const allEvents = eventsData?.events || [];

  // Get next upcoming UFC event
  const nextUFCEvent = allEvents
    .filter((e: Event) => !e.hasStarted && !e.isComplete && e.promotion?.toUpperCase() === 'UFC')
    .sort((a: Event, b: Event) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  // Fetch prediction stats for the next UFC event
  const { data: predictionData, isLoading: isPredictionsLoading } = useQuery({
    queryKey: ['eventPredictions', nextUFCEvent?.id],
    queryFn: () => apiService.getEventPredictionStats(nextUFCEvent!.id),
    enabled: !!nextUFCEvent?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch top comments from recent events
  const { data: topCommentsData, isLoading: isTopCommentsLoading } = useQuery({
    queryKey: ['topComments'],
    queryFn: () => apiService.getTopComments(),
    staleTime: 30 * 1000, // 30 seconds
    refetchOnMount: 'always',
  });

  // Upvote mutation
  const upvoteMutation = useMutation({
    mutationFn: ({ fightId, reviewId }: { fightId: string; reviewId: string }) =>
      apiService.toggleReviewUpvote(fightId, reviewId),
    onMutate: async ({ reviewId }) => {
      setUpvotingCommentId(reviewId);

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['topComments'] });
      const previousComments = queryClient.getQueryData(['topComments']);

      // Optimistic update
      queryClient.setQueryData(['topComments'], (old: any) => {
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
      // Update with actual server response
      queryClient.setQueryData(['topComments'], (old: any) => {
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
    },
    onError: (err, variables, context: any) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(['topComments'], context.previousComments);
      }
    },
    onSettled: () => {
      setUpvotingCommentId(null);
    },
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    seeAllButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    seeAllText: {
      color: colors.tint,
      fontSize: 14,
      fontWeight: '600',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    cardSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    comingSoonContainer: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    comingSoonText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 8,
    },
    iconContainer: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.tint + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -6,
    },
    gridCard: {
      width: '48%',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      margin: '1%',
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    gridIcon: {
      marginBottom: 8,
    },
    gridTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    gridSubtext: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },
    comingSoonBadge: {
      marginTop: 12,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: colors.tint + '20',
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    comingSoonBadgeText: {
      fontSize: 12,
      color: colors.tint,
      fontWeight: '600',
    },
  });

  // Placeholder sections for community features
  const communityFeatures = [
    {
      icon: 'trophy',
      title: 'Leaderboards',
      subtitle: 'Top predictors',
      route: null
    },
    {
      icon: 'star',
      title: 'Top Fights',
      subtitle: 'Highest rated',
      route: null
    },
    {
      icon: 'fire',
      title: 'Trending',
      subtitle: 'Hot topics',
      route: null
    },
    {
      icon: 'tags',
      title: 'Tag Lists',
      subtitle: 'Best moments',
      route: null
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Community Predictions for Next Event */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Top Predictions
            </Text>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            Who people think will win this weekend.
          </Text>

          {isLoading ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : nextUFCEvent ? (
            <View style={styles.card}>
              {isPredictionsLoading ? (
                <View style={{ alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.cardSubtext, { marginTop: 8 }]}>Loading predictions...</Text>
                </View>
              ) : predictionData && predictionData.totalPredictions > 0 ? (
                <View>
                  {/* Top Predicted Winners */}
                  {predictionData.topFighters.length > 0 && (
                    <View>
                      <Text style={[styles.cardSubtext, { fontWeight: '600', marginBottom: 8 }]}>
                        🏆 Top Predicted Winners
                      </Text>
                      {predictionData.topFighters.slice(0, 5).map((fighter, index) => {
                        const percentage = fighter.totalFightPredictions > 0
                          ? Math.round((fighter.winPredictions / fighter.totalFightPredictions) * 100)
                          : 0;

                        return (
                          <TouchableOpacity
                            key={fighter.fighterId}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 6,
                              borderBottomWidth: index < Math.min(predictionData.topFighters.length, 5) - 1 ? 1 : 0,
                              borderBottomColor: colors.border,
                            }}
                            onPress={() => router.push(`/fight/${fighter.fightId}` as any)}
                          >
                            <Text style={[styles.cardSubtext, { fontSize: 13, marginRight: 8, width: 16 }]}>
                              {index + 1}.
                            </Text>
                            {fighter.profileImage && (
                              <Image
                                source={{ uri: fighter.profileImage.startsWith('http') ? fighter.profileImage : `${apiService.baseURL}${fighter.profileImage}` }}
                                style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }}
                              />
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.cardSubtext, { fontSize: 13 }]}>
                                {percentage}% picked {fighter.name} to beat {fighter.opponent.name}.
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonBadgeText}>
                    No predictions yet - be the first!
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No upcoming UFC events</Text>
              <Text style={styles.cardSubtext}>
                Check back later for community predictions
              </Text>
            </View>
          )}
        </View>

        {/* Most Hype Section */}
        {!isLoading && nextUFCEvent && predictionData && predictionData.mostHypedFights.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Most Hype</Text>
            </View>
            <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
              Upcoming fights with heat on them.
            </Text>
            <View style={styles.card}>
              {predictionData.mostHypedFights.map((fight, index) => (
                <TouchableOpacity
                  key={fight.fightId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 8,
                    borderBottomWidth: index < predictionData.mostHypedFights.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                  onPress={() => router.push(`/fight/${fight.fightId}` as any)}
                >
                  <Text style={[styles.cardSubtext, { fontSize: 13, marginRight: 8, width: 16 }]}>
                    {index + 1}.
                  </Text>
                  {fight.fighter1.profileImage && (
                    <Image
                      source={{ uri: fight.fighter1.profileImage.startsWith('http') ? fight.fighter1.profileImage : `${apiService.baseURL}${fight.fighter1.profileImage}` }}
                      style={{ width: 32, height: 32, borderRadius: 16, marginRight: 6 }}
                    />
                  )}
                  <Text style={[styles.cardSubtext, { fontSize: 13, marginRight: 4 }]}>vs</Text>
                  {fight.fighter2.profileImage && (
                    <Image
                      source={{ uri: fight.fighter2.profileImage.startsWith('http') ? fight.fighter2.profileImage : `${apiService.baseURL}${fight.fighter2.profileImage}` }}
                      style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardSubtext, { fontSize: 13 }]}>
                      {fight.fighter1.name} vs {fight.fighter2.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                      <FontAwesome6
                        name="fire-flame-curved"
                        size={14}
                        color='#FF6B35'
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.cardSubtext, { fontSize: 12, color: colors.textSecondary }]}>
                        {fight.averageHype}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Top Fights Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Fights</Text>
            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => router.push('/fights' as any)}
            >
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            Highly rated on Fight Crew.
          </Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Highest rated fights</Text>
            <Text style={styles.cardSubtext}>
              Top 3 fights change daily based on community ratings
            </Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonBadgeText}>
                Coming Soon
              </Text>
            </View>
          </View>
        </View>

        {/* Top Fighters Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Fighters</Text>
            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => router.push('/fighters' as any)}
            >
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            Entertaining every time.
          </Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Highest rated fighters</Text>
            <Text style={styles.cardSubtext}>
              Top 3 fighters change daily based on fight performance
            </Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonBadgeText}>
                Coming Soon
              </Text>
            </View>
          </View>
        </View>

        {/* User Leaderboard Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>User Leaderboard</Text>
            <TouchableOpacity style={styles.seeAllButton}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            Users with the best predictions and comments.
          </Text>
        </View>

        {/* Top Comments Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Comments</Text>
            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => router.push('/comments' as any)}
            >
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            Recent hot takes from our community.
          </Text>

          {isTopCommentsLoading ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.cardSubtext, { marginTop: 8 }]}>Loading comments...</Text>
            </View>
          ) : topCommentsData && topCommentsData.data.length > 0 ? (
            topCommentsData.data.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                onPress={() => router.push(`/fight/${comment.fight.id}` as any)}
                onUpvote={() => upvoteMutation.mutate({ fightId: comment.fight.id, reviewId: comment.id })}
                isUpvoting={upvotingCommentId === comment.id}
                isAuthenticated={isAuthenticated}
              />
            ))
          ) : (
            <View style={styles.card}>
              <Text style={[styles.cardSubtext, { textAlign: 'center' }]}>
                No comments yet
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
