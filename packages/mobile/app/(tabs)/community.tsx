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
import UpcomingFightCard from '../../components/fight-cards/UpcomingFightCard';
import CompletedFightCard from '../../components/fight-cards/CompletedFightCard';
import HotPredictionCard from '../../components/fight-cards/HotPredictionCard';
import EvenPredictionCard from '../../components/fight-cards/EvenPredictionCard';
import FighterCard from '../../components/FighterCard';

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

  // Fetch top upcoming fights
  const { data: topUpcomingFights, isLoading: isTopUpcomingLoading } = useQuery({
    queryKey: ['topUpcomingFights'],
    queryFn: () => apiService.getTopUpcomingFights(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch top recent fights
  const { data: topRecentFights, isLoading: isTopRecentLoading } = useQuery({
    queryKey: ['topRecentFights'],
    queryFn: () => apiService.getTopRecentFights(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch hot predictions
  const { data: hotPredictions, isLoading: isHotPredictionsLoading } = useQuery({
    queryKey: ['hotPredictions'],
    queryFn: () => apiService.getHotPredictions(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch even predictions
  const { data: evenPredictions, isLoading: isEvenPredictionsLoading } = useQuery({
    queryKey: ['evenPredictions'],
    queryFn: () => apiService.getEvenPredictions(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch hot fighters
  const { data: hotFighters, isLoading: isHotFightersLoading } = useQuery({
    queryKey: ['hotFighters'],
    queryFn: () => apiService.getHotFighters(),
    staleTime: 5 * 60 * 1000, // 5 minutes
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
      paddingBottom: 20,
    },
    section: {
      marginTop: 8,
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: 16,
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
      marginHorizontal: 16,
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
      marginHorizontal: 16,
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
    columnHeadersCompleted: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      marginLeft: -14,
      width: 60,
      justifyContent: 'center',
    },
    columnHeadersCompletedRight: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      marginRight: -17,
      width: 60,
      justifyContent: 'center',
    },
    columnHeaderText: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.5,
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
        {/* Top Upcoming Fights Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Upcoming Fights</Text>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            Upcoming fights with lots of hype
          </Text>
          <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
            {/* Left Column Header - ALL / HYPE */}
            <View style={styles.columnHeadersUpcoming}>
              <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                ALL
              </Text>
              <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                HYPE
              </Text>
            </View>

            {/* Right Column Header - MY / HYPE */}
            <View style={styles.columnHeadersUpcomingRight}>
              <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                MY
              </Text>
              <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                HYPE
              </Text>
            </View>
          </View>
          {isTopUpcomingLoading ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : topUpcomingFights && topUpcomingFights.data.length > 0 ? (
            topUpcomingFights.data.map((fight: any) => (
              <UpcomingFightCard
                key={fight.id}
                fight={fight}
                onPress={() => router.push(`/fight/${fight.id}` as any)}
                showEvent={true}
              />
            ))
          ) : (
            <View style={styles.card}>
              <Text style={[styles.cardSubtext, { textAlign: 'center' }]}>
                No upcoming fights found
              </Text>
            </View>
          )}
        </View>

        {/* Top Recent Fights Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Recent Fights</Text>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            Recent fights that delivered entertainment
          </Text>
          <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
            {/* Left Column Header - ALL / RATINGS */}
            <View style={styles.columnHeadersCompleted}>
              <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                ALL
              </Text>
              <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                RATINGS
              </Text>
            </View>

            {/* Right Column Header - MY / RATING */}
            <View style={styles.columnHeadersCompletedRight}>
              <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                MY
              </Text>
              <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                RATING
              </Text>
            </View>
          </View>
          {isTopRecentLoading ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : topRecentFights && topRecentFights.data.length > 0 ? (
            topRecentFights.data.map((fight: any) => (
              <CompletedFightCard
                key={fight.id}
                fight={fight}
                onPress={() => router.push(`/fight/${fight.id}` as any)}
                showEvent={true}
              />
            ))
          ) : (
            <View style={styles.card}>
              <Text style={[styles.cardSubtext, { textAlign: 'center' }]}>
                No recent fights found
              </Text>
            </View>
          )}
        </View>

        {/* Hot Predictions Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Hot Predictions</Text>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            Lots of predictions are coming in on these fights
          </Text>
          {isHotPredictionsLoading ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : hotPredictions && hotPredictions.data.length > 0 ? (
            hotPredictions.data.map((fight: any) => (
              <HotPredictionCard
                key={fight.id}
                fight={fight}
                onPress={() => router.push(`/fight/${fight.id}` as any)}
              />
            ))
          ) : (
            <View style={styles.card}>
              <Text style={[styles.cardSubtext, { textAlign: 'center' }]}>
                No hot predictions found
              </Text>
            </View>
          )}
        </View>

        {/* Even Predictions Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Even Predictions</Text>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            The crowd is split on who will win these upcoming fights
          </Text>
          {isEvenPredictionsLoading ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : evenPredictions && evenPredictions.data.length > 0 ? (
            evenPredictions.data.map((fight: any) => (
              <EvenPredictionCard
                key={fight.id}
                fight={fight}
                onPress={() => router.push(`/fight/${fight.id}` as any)}
              />
            ))
          ) : (
            <View style={styles.card}>
              <Text style={[styles.cardSubtext, { textAlign: 'center' }]}>
                No even predictions found
              </Text>
            </View>
          )}
        </View>

        {/* Hot Fighters Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Hot Fighters</Text>
          </View>
          <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
            Fighters who always entertain
          </Text>
          {isHotFightersLoading ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : hotFighters && (hotFighters.data.recent.length > 0 || hotFighters.data.upcoming.length > 0) ? (
            <>
              {[...hotFighters.data.recent, ...hotFighters.data.upcoming].map((fighterData: any) => (
                <FighterCard
                  key={fighterData.fighter.id}
                  fighter={fighterData.fighter}
                  avgRating={fighterData.avgRating}
                  fightCount={fighterData.fightCount}
                  onPress={() => router.push(`/(tabs)/fighters/${fighterData.fighter.id}` as any)}
                />
              ))}
            </>
          ) : (
            <View style={styles.card}>
              <Text style={[styles.cardSubtext, { textAlign: 'center' }]}>
                No hot fighters found
              </Text>
            </View>
          )}
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
