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
  TextInput,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '../../constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FontAwesome6 } from '@expo/vector-icons';
import { apiService } from '../../services/api';
import { CommentCard, FlagReviewModal, CustomAlert } from '../../components';
import { useAuth } from '../../store/AuthContext';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import UpcomingFightCard from '../../components/fight-cards/UpcomingFightCard';
import CompletedFightCard from '../../components/fight-cards/CompletedFightCard';
import HotPredictionCard from '../../components/fight-cards/HotPredictionCard';
import EvenPredictionCard from '../../components/fight-cards/EvenPredictionCard';
import FighterCard from '../../components/FighterCard';
import { PreFightCommentCard } from '../../components/PreFightCommentCard';
import { getHypeHeatmapColor } from '../../utils/heatmap';

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
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [reviewToFlag, setReviewToFlag] = useState<{ fightId: string; reviewId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hypeFightsPeriod, setHypeFightsPeriod] = useState<'week' | 'month' | '3months'>('week');
  const [topFightsPeriod, setTopFightsPeriod] = useState<'week' | 'month' | '3months' | 'year' | 'all'>('week');

  // Mix 70% heatmap color with 30% background color for icon (same as CompletedFightCard)
  const getIconColor = (heatmapColor: string, bgColor: string): string => {
    // Parse heatmap color (RGB or hex)
    const heatmapRgbaMatch = heatmapColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    const heatmapHexMatch = heatmapColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

    let heatmapR = 0, heatmapG = 0, heatmapB = 0;
    if (heatmapRgbaMatch) {
      heatmapR = parseInt(heatmapRgbaMatch[1]);
      heatmapG = parseInt(heatmapRgbaMatch[2]);
      heatmapB = parseInt(heatmapRgbaMatch[3]);
    } else if (heatmapHexMatch) {
      heatmapR = parseInt(heatmapHexMatch[1], 16);
      heatmapG = parseInt(heatmapHexMatch[2], 16);
      heatmapB = parseInt(heatmapHexMatch[3], 16);
    }

    // Parse background color
    const bgRgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    const bgHexMatch = bgColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

    let bgR = 255, bgG = 255, bgB = 255;
    if (bgRgbaMatch) {
      bgR = parseInt(bgRgbaMatch[1]);
      bgG = parseInt(bgRgbaMatch[2]);
      bgB = parseInt(bgRgbaMatch[3]);
    } else if (bgHexMatch) {
      bgR = parseInt(bgHexMatch[1], 16);
      bgG = parseInt(bgHexMatch[2], 16);
      bgB = parseInt(bgHexMatch[3], 16);
    }

    // Mix 70% heatmap + 30% background
    const mixedR = Math.round(heatmapR * 0.7 + bgR * 0.3);
    const mixedG = Math.round(heatmapG * 0.7 + bgG * 0.3);
    const mixedB = Math.round(heatmapB * 0.7 + bgB * 0.3);

    return `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
  };

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

  // Fetch top pre-fight comments
  const { data: topPreFightCommentsData, isLoading: isTopPreFightCommentsLoading } = useQuery({
    queryKey: ['topPreFightComments', isAuthenticated],
    queryFn: () => apiService.getTopPreFightComments(),
    staleTime: 30 * 1000, // 30 seconds
    refetchOnMount: 'always',
  });

  // Pre-fetch all upcoming fight periods to prevent layout jumping
  useQuery({
    queryKey: ['topUpcomingFights', isAuthenticated, 'week'],
    queryFn: () => apiService.getTopUpcomingFights('week'),
    staleTime: 5 * 60 * 1000,
  });
  useQuery({
    queryKey: ['topUpcomingFights', isAuthenticated, 'month'],
    queryFn: () => apiService.getTopUpcomingFights('month'),
    staleTime: 5 * 60 * 1000,
  });
  useQuery({
    queryKey: ['topUpcomingFights', isAuthenticated, '3months'],
    queryFn: () => apiService.getTopUpcomingFights('3months'),
    staleTime: 5 * 60 * 1000,
  });

  // Pre-fetch all recent fight periods to prevent layout jumping
  useQuery({
    queryKey: ['topRecentFights', isAuthenticated, 'week'],
    queryFn: () => apiService.getTopRecentFights('week'),
    staleTime: 5 * 60 * 1000,
  });
  useQuery({
    queryKey: ['topRecentFights', isAuthenticated, 'month'],
    queryFn: () => apiService.getTopRecentFights('month'),
    staleTime: 5 * 60 * 1000,
  });
  useQuery({
    queryKey: ['topRecentFights', isAuthenticated, '3months'],
    queryFn: () => apiService.getTopRecentFights('3months'),
    staleTime: 5 * 60 * 1000,
  });
  useQuery({
    queryKey: ['topRecentFights', isAuthenticated, 'year'],
    queryFn: () => apiService.getTopRecentFights('year'),
    staleTime: 5 * 60 * 1000,
  });
  useQuery({
    queryKey: ['topRecentFights', isAuthenticated, 'all'],
    queryFn: () => apiService.getTopRecentFights('all'),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch top upcoming fights (active period)
  const { data: topUpcomingFights, isFetching: isTopUpcomingFetching } = useQuery({
    queryKey: ['topUpcomingFights', isAuthenticated, hypeFightsPeriod],
    queryFn: () => apiService.getTopUpcomingFights(hypeFightsPeriod),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch top recent fights (active period)
  const { data: topRecentFights, isFetching: isTopRecentFetching } = useQuery({
    queryKey: ['topRecentFights', isAuthenticated, topFightsPeriod],
    queryFn: () => apiService.getTopRecentFights(topFightsPeriod),
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

  // Fetch classic fight of the day (hardcoded for now - Della Maddalena vs Makhachev)
  const classicFightId = 'bfa5eaa2-e58f-4d17-9c34-77bd8f5d33d1';
  const { data: classicFightResponse, isLoading: isClassicFightLoading } = useQuery({
    queryKey: ['classicFight', classicFightId, isAuthenticated],
    queryFn: () => apiService.getFight(classicFightId),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - classic fights don't change often
  });

  const classicFightData = classicFightResponse?.fight;

  // Debug logging for classic fight data
  React.useEffect(() => {
    if (classicFightData) {
      console.log('[Community] Classic Fight Data:', {
        id: classicFightData.id,
        averageRating: classicFightData.averageRating,
        averageHype: classicFightData.averageHype,
        fighter1: classicFightData.fighter1?.firstName,
        fighter2: classicFightData.fighter2?.firstName,
      });
    }
  }, [classicFightData]);

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
      // Also invalidate the fight-specific reviews cache
      queryClient.invalidateQueries({ queryKey: ['fightReviews', variables.fightId] });
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

  // Upvote pre-fight comment mutation
  const upvotePreFightCommentMutation = useMutation({
    mutationFn: ({ fightId, commentId }: { fightId: string; commentId: string }) =>
      apiService.togglePreFightCommentUpvote(fightId, commentId),
    onMutate: async ({ commentId }) => {
      setUpvotingCommentId(commentId);

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['topPreFightComments'] });
      const previousComments = queryClient.getQueryData(['topPreFightComments']);

      // Optimistic update
      queryClient.setQueryData(['topPreFightComments', isAuthenticated], (old: any) => {
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
      // Update with actual server response
      queryClient.setQueryData(['topPreFightComments', isAuthenticated], (old: any) => {
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
      // Also invalidate the fight-specific pre-flight comments cache
      queryClient.invalidateQueries({ queryKey: ['preFightComments', variables.fightId] });
    },
    onError: (err, variables, context: any) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(['topPreFightComments', isAuthenticated], context.previousComments);
      }
    },
    onSettled: () => {
      setUpvotingCommentId(null);
    },
  });

  // Flag review mutation
  const flagReviewMutation = useMutation({
    mutationFn: ({ fightId, reviewId, reason }: { fightId: string; reviewId: string; reason: string }) =>
      apiService.flagReview(fightId, reviewId, reason),
    onSuccess: () => {
      showSuccess('Review has been flagged for moderation');
      setFlagModalVisible(false);
      setReviewToFlag(null);
      queryClient.invalidateQueries({ queryKey: ['topComments'] });
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

  const handleSearch = () => {
    Keyboard.dismiss(); // Dismiss keyboard before navigating
    if (searchQuery.trim().length >= 2) {
      router.push(`/search-results?q=${encodeURIComponent(searchQuery.trim())}` as any);
    }
  };

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
    searchContainer: {
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
      marginBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    searchBarWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      height: 44,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      height: 44,
    },
    searchButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchButtonText: {
      color: '#000000',
      fontSize: 15,
      fontWeight: '600',
    },
    classicFightContainer: {
      overflow: 'hidden',
      marginBottom: 12,
    },
    classicFightImage: {
      width: '100%',
      height: 200,
    },
    classicFightOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    classicRatingBox: {
      width: 50,
      height: 50,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    classicRatingText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
      position: 'relative',
      zIndex: 1,
    },
    classicFightInfo: {
      flex: 1,
    },
    classicFightTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
      marginBottom: 4,
    },
    classicFightEvent: {
      fontSize: 12,
      fontWeight: '500',
      color: '#CCCCCC',
    },
    filterTabsContainer: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 12,
      gap: 6,
      flexWrap: 'wrap',
    },
    filterTab: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    filterTabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.border,
    },
    filterTabText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    filterTabTextActive: {
      color: colors.textOnAccent,
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
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBarWrapper}>
            <View style={styles.searchInputContainer}>
              <FontAwesome
                name="search"
                size={18}
                color={colors.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search"
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
            </View>
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleSearch}
              disabled={searchQuery.trim().length < 2}
            >
              <Text style={styles.searchButtonText}>Search</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Top Upcoming Fights Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 48 }}>
              <FontAwesome6
                name="fire-flame-curved"
                size={40}
                color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
                style={{ opacity: 0.4 }}
              />
              <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Hype Fights</Text>
            </View>
          </View>

          {/* Time Period Filter Tabs */}
          <View style={styles.filterTabsContainer}>
            <TouchableOpacity
              style={[styles.filterTab, hypeFightsPeriod === 'week' && styles.filterTabActive]}
              onPress={() => setHypeFightsPeriod('week')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.filterTabText, hypeFightsPeriod === 'week' && styles.filterTabTextActive]}>
                This Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, hypeFightsPeriod === 'month' && styles.filterTabActive]}
              onPress={() => setHypeFightsPeriod('month')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.filterTabText, hypeFightsPeriod === 'month' && styles.filterTabTextActive]}>
                This Month
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, hypeFightsPeriod === '3months' && styles.filterTabActive]}
              onPress={() => setHypeFightsPeriod('3months')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.filterTabText, hypeFightsPeriod === '3months' && styles.filterTabTextActive]}>
                3 Months
              </Text>
            </TouchableOpacity>
          </View>

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
          {!topUpcomingFights ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : topUpcomingFights.data.length > 0 ? (
            topUpcomingFights.data.map((fight: any) => {
              if (fight.id === '68606cbb-5e84-4bba-8c80-9bdd2e691994') {
                console.log('[Community Screen] Shevchenko vs Zhang fight data:', {
                  id: fight.id,
                  userHypePrediction: fight.userHypePrediction,
                  averageHype: fight.averageHype,
                  fighter1: fight.fighter1?.firstName + ' ' + fight.fighter1?.lastName,
                  fighter2: fight.fighter2?.firstName + ' ' + fight.fighter2?.lastName,
                });
              }
              return (
                <UpcomingFightCard
                  key={fight.id}
                  fight={fight}
                  onPress={() => router.push(`/fight/${fight.id}` as any)}
                  showEvent={true}
                />
              );
            })
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
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 48 }}>
              <FontAwesome
                name="star"
                size={40}
                color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
                style={{ opacity: 0.4 }}
              />
              <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Top Fights</Text>
            </View>
          </View>

          {/* Time Period Filter Tabs */}
          <View style={styles.filterTabsContainer}>
            <TouchableOpacity
              style={[styles.filterTab, topFightsPeriod === 'week' && styles.filterTabActive]}
              onPress={() => setTopFightsPeriod('week')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.filterTabText, topFightsPeriod === 'week' && styles.filterTabTextActive]}>
                Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, topFightsPeriod === 'month' && styles.filterTabActive]}
              onPress={() => setTopFightsPeriod('month')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.filterTabText, topFightsPeriod === 'month' && styles.filterTabTextActive]}>
                Month
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, topFightsPeriod === '3months' && styles.filterTabActive]}
              onPress={() => setTopFightsPeriod('3months')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.filterTabText, topFightsPeriod === '3months' && styles.filterTabTextActive]}>
                3 Months
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, topFightsPeriod === 'year' && styles.filterTabActive]}
              onPress={() => setTopFightsPeriod('year')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.filterTabText, topFightsPeriod === 'year' && styles.filterTabTextActive]}>
                Year
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, topFightsPeriod === 'all' && styles.filterTabActive]}
              onPress={() => setTopFightsPeriod('all')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.filterTabText, topFightsPeriod === 'all' && styles.filterTabTextActive]}>
                All Time
              </Text>
            </TouchableOpacity>
          </View>

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
          {!topRecentFights ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : topRecentFights.data.length > 0 ? (
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

        {/* Classic Fight Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 48 }}>
              <FontAwesome
                name="trophy"
                size={40}
                color={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
                style={{ opacity: 0.4 }}
              />
              <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Classic Fight</Text>
            </View>
          </View>

          {/* Fight Thumbnail */}
          <TouchableOpacity
            style={styles.classicFightContainer}
            onPress={() => router.push(`/fight/${classicFightId}` as any)}
          >
            <Image
              source={require('../../assets/ufc-jiri-glover.jpg')}
              style={styles.classicFightImage}
              resizeMode="cover"
            />
            <View style={styles.classicFightOverlay}>
              {/* Rating Box on the left */}
              {classicFightData && (() => {
                const ratingColor = getHypeHeatmapColor(classicFightData.averageRating || 0);
                const starColor = getIconColor(ratingColor, colors.background);
                return (
                  <View style={[styles.classicRatingBox, { backgroundColor: ratingColor }]}>
                    <FontAwesome
                      name="star"
                      size={20}
                      color={starColor}
                      style={{ position: 'absolute' }}
                    />
                    <Text style={styles.classicRatingText}>
                      {classicFightData.averageRating ? classicFightData.averageRating.toFixed(1) : '0.0'}
                    </Text>
                  </View>
                );
              })()}

              {/* Fight Info on the right */}
              <View style={styles.classicFightInfo}>
                <Text style={styles.classicFightTitle}>
                  {classicFightData?.fighter1?.firstName && classicFightData?.fighter2?.firstName ?
                    `${classicFightData.fighter1.firstName} ${classicFightData.fighter1.lastName} vs ${classicFightData.fighter2.firstName} ${classicFightData.fighter2.lastName}`
                    : 'Loading...'
                  }
                </Text>
                <Text style={styles.classicFightEvent}>
                  {classicFightData?.event?.name || 'Loading event...'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Hot Predictions Section - HIDDEN */}
        {false && (
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
        )}

        {/* Even Predictions Section - HIDDEN */}
        {false && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Even Predictions</Text>
            </View>
            <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
              The crowd is split on who will win these fights
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
        )}

        {/* Hot Fighters Section - HIDDEN */}
        {false && (
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
                    lastFightDate={fighterData.lastFightDate}
                    nextFightDate={fighterData.nextFightDate}
                    onPress={() => router.push(`/fighter/${fighterData.fighter.id}` as any)}
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
        )}

        {/* Pre-Fight Comments Section - HIDDEN */}
        {false && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Pre-Fight Comments</Text>
              <TouchableOpacity
                style={styles.seeAllButton}
                onPress={() => router.push('/pre-fight-comments' as any)}
              >
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.cardSubtext, { marginBottom: 12 }]}>
              Top pre-fight hype for upcoming fights
            </Text>

            {isTopPreFightCommentsLoading ? (
              <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.cardSubtext, { marginTop: 8 }]}>Loading comments...</Text>
              </View>
            ) : topPreFightCommentsData && topPreFightCommentsData.data.length > 0 ? (
              topPreFightCommentsData.data.map((comment) => (
                <PreFightCommentCard
                  key={comment.id}
                  comment={comment}
                  onPress={() => router.push(`/fight/${comment.fight.id}` as any)}
                  onUpvote={() => upvotePreFightCommentMutation.mutate({ fightId: comment.fight.id, commentId: comment.id })}
                  isUpvoting={upvotingCommentId === comment.id}
                  isAuthenticated={isAuthenticated}
                />
              ))
            ) : (
              <View style={styles.card}>
                <Text style={[styles.cardSubtext, { textAlign: 'center' }]}>
                  No pre-fight comments yet
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Top Post-Fight Comments Section - HIDDEN */}
        {false && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Post-Fight Comments</Text>
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
                  onFlag={() => handleFlagReview(comment.fight.id, comment.id)}
                  isUpvoting={upvotingCommentId === comment.id}
                  isFlagging={flagReviewMutation.isPending && reviewToFlag?.reviewId === comment.id}
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
        )}
      </ScrollView>

      {/* Modals */}
      <FlagReviewModal
        visible={flagModalVisible}
        onClose={() => setFlagModalVisible(false)}
        onSubmit={submitFlagReview}
        isLoading={flagReviewMutation.isPending}
        colorScheme={colorScheme}
      />

      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </View>
  );
}
