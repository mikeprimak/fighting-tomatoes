import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';
import { useOrgFilter } from '../../store/OrgFilterContext';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { CustomAlert } from '../../components/CustomAlert';
import { CommentCard, PreFightCommentCard } from '../../components';
import OrgFilterTabs from '../../components/OrgFilterTabs';
import { getHypeHeatmapColor } from '../../utils/heatmap';
import { api, apiService } from '../../services/api';
import * as Haptics from 'expo-haptics';
import PredictionAccuracyChart from '../../components/PredictionAccuracyChart';
import SectionContainer from '../../components/SectionContainer';

interface EventAccuracy {
  eventId: string;
  eventName: string;
  eventDate: string;
  promotion?: string;
  correct: number;
  incorrect: number;
}

interface TopReview {
  id: string;
  fightId: string;
  content: string;
  rating: number | null;
  upvotes: number;
  userHasUpvoted: boolean;
  createdAt: string;
  isReply: boolean;
  fight: {
    id: string;
    isComplete?: boolean;
    hasStarted?: boolean;
    fighter1Name: string;
    fighter2Name: string;
    eventName: string;
    eventDate: string;
    promotion?: string;
  };
}

interface TopPreflightComment {
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
    isComplete?: boolean;
    hasStarted?: boolean;
    fighter1Id: string;
    fighter2Id: string;
    fighter1Name: string;
    fighter2Name: string;
    eventName: string;
    eventDate: string;
    promotion?: string;
  };
}

// Helper to get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
const getOrdinalSuffix = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function ProfileScreen() {
  const { user, logout, refreshUserData, isAuthenticated } = useAuth();
  const { selectedOrgs, filterByPromotion } = useOrgFilter();

  // Refresh user data when org filter changes
  useEffect(() => {
    if (isAuthenticated) {
      const orgsArray = Array.from(selectedOrgs);
      refreshUserData(orgsArray.length > 0 ? orgsArray : undefined);
    }
  }, [selectedOrgs, isAuthenticated]);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showConfirm, showError, hideAlert } = useCustomAlert();
  const [upvotingReviewId, setUpvotingReviewId] = useState<string | null>(null);

  // Prediction accuracy data state
  const [predictionAccuracy, setPredictionAccuracy] = useState<{
    accuracyByEvent: EventAccuracy[];
    totalCorrect: number;
    totalIncorrect: number;
  }>({ accuracyByEvent: [], totalCorrect: 0, totalIncorrect: 0 });

  // Track if user has ANY predictions (for showing time filter)
  const [hasAnyPredictions, setHasAnyPredictions] = useState<boolean>(false);

  // Global standing data state
  const [globalStanding, setGlobalStanding] = useState<{
    position: number | null;
    totalUsers: number;
    hasRanking: boolean;
  }>({ position: null, totalUsers: 0, hasRanking: false });

  // Top reviews data state
  const [topReviews, setTopReviews] = useState<{
    reviews: TopReview[];
    totalWithUpvotes: number;
  }>({ reviews: [], totalWithUpvotes: 0 });

  // Top pre-flight comments data state
  const [topPreflightComments, setTopPreflightComments] = useState<{
    comments: TopPreflightComment[];
    totalWithUpvotes: number;
  }>({ comments: [], totalWithUpvotes: 0 });
  const [upvotingPreflightId, setUpvotingPreflightId] = useState<string | null>(null);

  // Time filter state - default to 'allTime' to show all predictions
  const [timeFilter, setTimeFilter] = useState<string>('allTime');
  const timeFilterOptions = [
    { key: 'week', label: 'Past Week' },
    { key: 'month', label: 'Month' },
    { key: '3months', label: '3 mo.' },
    { key: 'year', label: 'Year' },
    { key: 'allTime', label: 'All Time' },
  ];

  // Check if user has ANY predictions (once on mount)
  useEffect(() => {
    const checkForAnyPredictions = async () => {
      try {
        const data = await api.getPredictionAccuracyByEvent('allTime');
        setHasAnyPredictions((data.totalCorrect + data.totalIncorrect) > 0);
      } catch (error) {
        console.error('Failed to check for predictions:', error);
      }
    };

    if (user) {
      checkForAnyPredictions();
    }
  }, [user?.id]);

  // Fetch prediction accuracy and global standing data
  useEffect(() => {
    const fetchPredictionData = async () => {
      try {
        const [accuracyData, standingData] = await Promise.all([
          api.getPredictionAccuracyByEvent(timeFilter),
          api.getGlobalStanding(timeFilter),
        ]);

        setPredictionAccuracy({
          accuracyByEvent: accuracyData.accuracyByEvent,
          totalCorrect: accuracyData.totalCorrect,
          totalIncorrect: accuracyData.totalIncorrect,
        });

        setGlobalStanding({
          position: standingData.position,
          totalUsers: standingData.totalUsers,
          hasRanking: standingData.hasRanking,
        });
      } catch (error) {
        console.error('Failed to fetch prediction data:', error);
      }
    };

    if (user) {
      fetchPredictionData();
    }
  }, [user?.id, timeFilter]);

  // Fetch user's top upvoted reviews and comments when screen comes into focus
  // This ensures data is fresh after user navigates back from other screens
  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        if (!user) return;

        try {
          const [reviewsData, commentsData] = await Promise.all([
            api.getMyTopReviews(3),
            api.getMyTopPreflightComments(3),
          ]);

          if (reviewsData && reviewsData.reviews) {
            setTopReviews(reviewsData);
          }
          if (commentsData && commentsData.comments) {
            setTopPreflightComments(commentsData);
          }
        } catch (error) {
          console.log('Error fetching profile comments:', error);
        }
      };

      fetchData();
    }, [user?.id])
  );

  // Auto-refresh user data if averageRating or averageHype is missing (from old cached data)
  // OR if distributions are empty (to get real data)
  useEffect(() => {
    console.log('=== User Profile Data ===');
    console.log('User:', JSON.stringify(user, null, 2));

    if (user && (
      !user.hasOwnProperty('averageRating') ||
      !user.hasOwnProperty('averageHype') ||
      !user.ratingDistribution ||
      Object.keys(user.ratingDistribution || {}).length === 0 ||
      !user.hypeDistribution ||
      Object.keys(user.hypeDistribution || {}).length === 0
    )) {
      console.log('Profile: Missing data or empty distributions, refreshing user data...');
      refreshUserData();
    }
  }, [user?.id]); // Only run when user ID changes (mount/login)

  const handleLogout = () => {
    showConfirm(
      'Are you sure you want to sign out?',
      async () => {
        try {
          console.log('Logout button pressed - calling logout function');
          await logout();
          console.log('Logout completed successfully');
        } catch (error) {
          console.error('Logout error:', error);
          showConfirm(
            'Failed to sign out. Force logout?',
            async () => {
              try {
                // Force clear all storage
                const AsyncStorage = await import('@react-native-async-storage/async-storage');
                await AsyncStorage.default.clear();
                // Force navigation
                const { router } = await import('expo-router');
                router.replace('/(auth)/login');
              } catch (e) {
                console.error('Force logout error:', e);
              }
            },
            'Error',
            'Force Logout',
            'Cancel',
            true
          );
        }
      },
      'Sign Out',
      'Sign Out',
      'Cancel',
      true
    );
  };

  // Handle upvote on a review
  const handleUpvote = async (fightId: string, reviewId: string) => {
    if (upvotingReviewId) return;

    setUpvotingReviewId(reviewId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await apiService.toggleReviewUpvote(fightId, reviewId);
      // Refresh the top reviews to get updated upvote counts
      const data = await api.getMyTopReviews(3);
      if (data && data.reviews) {
        setTopReviews(data);
      }
    } catch (error) {
      console.error('Failed to upvote review:', error);
    } finally {
      setUpvotingReviewId(null);
    }
  };

  // Handle upvote on a pre-flight comment
  const handleUpvotePreflight = async (fightId: string, commentId: string) => {
    if (upvotingPreflightId) return;

    setUpvotingPreflightId(commentId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await apiService.togglePreFightCommentUpvote(fightId, commentId);
      // Refresh the top pre-flight comments to get updated upvote counts
      const data = await api.getMyTopPreflightComments(3);
      if (data && data.comments) {
        setTopPreflightComments(data);
      }
    } catch (error) {
      console.error('Failed to upvote pre-flight comment:', error);
    } finally {
      setUpvotingPreflightId(null);
    }
  };

  const styles = createStyles(colors);

  // Filter prediction accuracy data by org
  const filteredPredictionAccuracy = useMemo(() => {
    if (selectedOrgs.size === 0) return predictionAccuracy;
    const filteredEvents = predictionAccuracy.accuracyByEvent.filter(event =>
      filterByPromotion(event.promotion)
    );
    const totalCorrect = filteredEvents.reduce((sum, e) => sum + e.correct, 0);
    const totalIncorrect = filteredEvents.reduce((sum, e) => sum + e.incorrect, 0);
    return {
      accuracyByEvent: filteredEvents,
      totalCorrect,
      totalIncorrect,
    };
  }, [predictionAccuracy, selectedOrgs.size, filterByPromotion]);

  // Filter reviews by org
  const filteredTopReviews = useMemo(() => {
    if (selectedOrgs.size === 0) return topReviews;
    const filteredReviews = topReviews.reviews.filter(review =>
      filterByPromotion(review.fight?.promotion)
    );
    return {
      reviews: filteredReviews,
      totalWithUpvotes: filteredReviews.length,
    };
  }, [topReviews, selectedOrgs.size, filterByPromotion]);

  // Filter pre-flight comments by org
  const filteredTopPreflightComments = useMemo(() => {
    if (selectedOrgs.size === 0) return topPreflightComments;
    const filteredComments = topPreflightComments.comments.filter(comment =>
      filterByPromotion(comment.fight?.promotion)
    );
    return {
      comments: filteredComments,
      totalWithUpvotes: filteredComments.length,
    };
  }, [topPreflightComments, selectedOrgs.size, filterByPromotion]);

  // Render star rating display (out of 10) with heatmap colors
  // Rounds to nearest whole number
  const renderStarRating = (rating: number) => {
    const stars = [];
    const maxStars = 10;
    const fullStars = Math.round(rating);

    for (let i = 0; i < maxStars; i++) {
      const starValue = i + 1;
      const starColor = getHypeHeatmapColor(starValue);

      if (i < fullStars) {
        // Full star
        stars.push(
          <FontAwesome key={i} name="star" size={28} color={starColor} />
        );
      } else {
        // Empty star
        stars.push(
          <FontAwesome key={i} name="star-o" size={28} color={colors.textSecondary} />
        );
      }
    }
    return stars;
  };

  // Render flame hype display (out of 10) with heatmap colors
  // Rounds to nearest whole number
  const renderFlameRating = (rating: number) => {
    const flames = [];
    const maxFlames = 10;
    const fullFlames = Math.round(rating);

    for (let i = 0; i < maxFlames; i++) {
      const flameValue = i + 1;
      const flameColor = getHypeHeatmapColor(flameValue);

      if (i < fullFlames) {
        // Full flame
        flames.push(
          <FontAwesome6 key={i} name="fire-flame-curved" size={28} color={flameColor} solid />
        );
      } else {
        // Empty flame
        flames.push(
          <FontAwesome6 key={i} name="fire-flame-curved" size={28} color={colors.textSecondary} />
        );
      }
    }
    return flames;
  };

  // Render distribution bar chart
  const renderDistributionChart = (distribution: Record<string, number>, type: 'rating' | 'hype') => {
    const ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Use real distribution data only
    const dataToUse = distribution || {};

    // If there's no data, show empty chart with message
    const hasData = Object.keys(dataToUse).length > 0;
    const maxCount = hasData ? Math.max(...Object.values(dataToUse), 1) : 1;
    const maxBarHeight = 82; // Maximum bar height to match colored box height

    const handleBarPress = (score: number) => {
      const route = type === 'hype' ? '/activity/my-hype' : '/activity/my-ratings';
      router.push(`${route}?filter=${score}` as any);
    };

    return (
      <View>
        {!hasData && (
          <Text style={[styles.emptyChartMessage, { color: colors.textSecondary }]}>
            No {type === 'rating' ? 'ratings' : 'hype scores'} yet
          </Text>
        )}
        <View style={styles.chartContainer}>
          {ratings.map((rating) => {
            const count = dataToUse[rating] || 0;
            const barHeight = count > 0 ? Math.max((count / maxCount) * maxBarHeight, 4) : 0;
            const barColor = getHypeHeatmapColor(rating);

            return (
              <TouchableOpacity
                key={rating}
                style={styles.barContainer}
                onPress={() => handleBarPress(rating)}
                activeOpacity={0.7}
              >
                <View style={styles.barWrapper}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        backgroundColor: barColor,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{rating}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Organization Filter Tabs */}
      <OrgFilterTabs />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Predictions Section */}
        <SectionContainer
          title="My Winner Picks"
          icon="trophy"
          iconColor="#fff"
          headerBgColor="#166534"
          containerBgColorDark="rgba(34, 197, 94, 0.05)"
          containerBgColorLight="rgba(34, 197, 94, 0.08)"
        >
          {/* Check if user has ANY predictions - if so, show time filter */}
          {!hasAnyPredictions ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8, textAlign: 'center' }}>
              {selectedOrgs.size > 0
                ? `No predictions for ${Array.from(selectedOrgs).join(' or ')} events`
                : (
                  <>
                    Predict winners on{' '}
                    <Text
                      style={{ color: colors.primary, fontWeight: '600' }}
                      onPress={() => router.push('/(tabs)')}
                    >
                      Upcoming Fights
                    </Text>
                    .
                  </>
                )}
            </Text>
          ) : (
            <>
              {/* Time Filter Buttons - always visible when user has predictions */}
              <View style={styles.filterTabsContainer}>
                {timeFilterOptions.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => setTimeFilter(option.key)}
                    style={[styles.filterTab, timeFilter === option.key && styles.filterTabActive]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.filterTabText, timeFilter === option.key && styles.filterTabTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ height: 4 }} />

              {/* Show content or empty message based on filtered data */}
              {(filteredPredictionAccuracy.totalCorrect + filteredPredictionAccuracy.totalIncorrect) === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 16, textAlign: 'center' }}>
                  No predictions in this time period
                </Text>
              ) : (
                <>
                  {/* Two stat boxes side by side */}
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                    {/* Prediction Accuracy - bordered */}
                    <View style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      padding: 12,
                    }}>
                      <Text style={[styles.predictionLabel, { color: colors.text }]}>Prediction{'\n'}Accuracy</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.predictionValue, { color: colors.text, fontSize: 20 }]}>
                          {(filteredPredictionAccuracy.totalCorrect + filteredPredictionAccuracy.totalIncorrect) > 0
                            ? `${Math.round((filteredPredictionAccuracy.totalCorrect / (filteredPredictionAccuracy.totalCorrect + filteredPredictionAccuracy.totalIncorrect)) * 100)}%`
                            : '—'}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                          ({filteredPredictionAccuracy.totalCorrect}/{filteredPredictionAccuracy.totalCorrect + filteredPredictionAccuracy.totalIncorrect})
                        </Text>
                      </View>
                    </View>

                    {/* Global Standing - bordered */}
                    <View style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      padding: 12,
                    }}>
                      <Text style={[styles.predictionLabel, { color: colors.text }]}>Global{'\n'}Standing</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.predictionValue, { color: colors.text, fontSize: 20 }]}>
                          {globalStanding.hasRanking
                            ? getOrdinalSuffix(globalStanding.position!)
                            : '—'}
                        </Text>
                        {globalStanding.hasRanking && globalStanding.totalUsers > 0 && (
                          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                            top {Math.round((globalStanding.position! / globalStanding.totalUsers) * 100)}%
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Prediction Accuracy Chart */}
                  <PredictionAccuracyChart
                    data={filteredPredictionAccuracy.accuracyByEvent}
                    totalCorrect={filteredPredictionAccuracy.totalCorrect}
                    totalIncorrect={filteredPredictionAccuracy.totalIncorrect}
                  />
                </>
              )}
            </>
          )}
        </SectionContainer>

        {/* Average Rating */}
        <SectionContainer
          title="My Ratings"
          icon="star"
          iconColor="#000"
          headerBgColor="#F5C518"
          containerBgColorDark="rgba(245, 197, 24, 0.05)"
          containerBgColorLight="rgba(245, 197, 24, 0.08)"
          headerRight={user?.totalRatings ? (
            <TouchableOpacity
              onPress={() => router.push('/activity/my-ratings' as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>See All</Text>
              <FontAwesome name="chevron-right" size={10} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          ) : undefined}
        >
          <View style={{ height: 10 }} />
          {!user?.totalRatings ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8, textAlign: 'center' }}>
              {selectedOrgs.size > 0
                ? `No ratings for ${Array.from(selectedOrgs).join(' or ')} fights`
                : (
                  <>
                    Rate fights on{' '}
                    <Text
                      style={{ color: colors.primary, fontWeight: '600' }}
                      onPress={() => router.push('/(tabs)/completed')}
                    >
                      Completed Fights
                    </Text>
                    .
                  </>
                )}
            </Text>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9 }}>
                {/* Large Star Icon */}
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.ratingIconContainer, { marginTop: 7 }]}>
                    <FontAwesome
                      name="star"
                      size={90}
                      color={getHypeHeatmapColor(Math.round(user?.averageRating || 0))}
                    />
                    <Text style={[styles.ratingIconText, { marginTop: -2 }]}>
                      {user?.averageRating ? user.averageRating.toFixed(1) : '0.0'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>avg.</Text>
                </View>

                {/* Distribution Chart */}
                <View style={{ flex: 1 }}>
                  {renderDistributionChart(user?.ratingDistribution || {}, 'rating')}
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, textAlign: 'center' }}>{user?.totalRatings || 0} fights</Text>
                </View>
              </View>
            </View>
          )}

          {/* My Comments (Post-Fight) */}
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FontAwesome name="comments" size={18} color={colors.text} />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, textTransform: 'uppercase', letterSpacing: 2 }}>My Comments</Text>
              </View>
              {filteredTopReviews?.reviews && filteredTopReviews.reviews.length > 0 && (
                <TouchableOpacity
                  onPress={() => router.push('/activity/my-comments' as any)}
                  style={{ position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>See All</Text>
                  <FontAwesome name="chevron-right" size={10} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            {!filteredTopReviews?.reviews || filteredTopReviews.reviews.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8, textAlign: 'center' }}>
                {selectedOrgs.size > 0
                  ? `No comments for ${Array.from(selectedOrgs).join(' or ')} fights`
                  : 'None yet.'}
              </Text>
            ) : (
              <View>
                {filteredTopReviews.reviews.map((review) => (
                  <View key={review.id} style={{ marginBottom: 8 }}>
                    <CommentCard
                      comment={{
                        id: review.id,
                        content: review.isReply ? `↳ ${review.content}` : review.content,
                        rating: review.rating || 0,
                        upvotes: review.upvotes,
                        userHasUpvoted: review.userHasUpvoted,
                        user: { displayName: 'Me' },
                        fight: review.fight ? {
                          id: review.fight.id,
                          fighter1Name: review.fight.fighter1Name,
                          fighter2Name: review.fight.fighter2Name,
                          eventName: review.fight.eventName,
                        } : undefined,
                      }}
                      onPress={() => router.push(`/fight/${review.fight?.id}?mode=completed` as any)}
                      onUpvote={() => handleUpvote(review.fightId, review.id)}
                      isUpvoting={upvotingReviewId === review.id}
                      isAuthenticated={isAuthenticated}
                      showMyReview={true}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </SectionContainer>

        {/* Average Hype */}
        <SectionContainer
          title="My Hype"
          icon="fire-flame-curved"
          iconFamily="fontawesome6"
          iconColor="#000"
          headerBgColor="#F5C518"
          containerBgColorDark="rgba(245, 197, 24, 0.05)"
          containerBgColorLight="rgba(245, 197, 24, 0.08)"
          headerRight={user?.totalHype ? (
            <TouchableOpacity
              onPress={() => router.push('/activity/my-hype' as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>See All</Text>
              <FontAwesome name="chevron-right" size={10} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          ) : undefined}
        >
          <View style={{ height: 10 }} />
          {!user?.totalHype ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8, textAlign: 'center' }}>
              {selectedOrgs.size > 0
                ? `No hype ratings for ${Array.from(selectedOrgs).join(' or ')} fights`
                : (
                  <>
                    Hype fights on{' '}
                    <Text
                      style={{ color: colors.primary, fontWeight: '600' }}
                      onPress={() => router.push('/(tabs)')}
                    >
                      Upcoming Fights
                    </Text>
                    .
                  </>
                )}
            </Text>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9 }}>
                {/* Large Flame Icon */}
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.ratingIconContainer, { marginTop: 7 }]}>
                    {/* Background circle for better text contrast */}
                    <View style={{
                      position: 'absolute',
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: getHypeHeatmapColor(Math.round(user?.averageHype || 0)),
                      opacity: 0.4,
                      top: 30,
                    }} />
                    <FontAwesome6
                      name="fire-flame-curved"
                      size={90}
                      color={getHypeHeatmapColor(Math.round(user?.averageHype || 0))}
                    />
                    <Text style={[styles.ratingIconText, { marginTop: 6 }]}>
                      {user?.averageHype ? user.averageHype.toFixed(1) : '0.0'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>avg.</Text>
                </View>

                {/* Distribution Chart */}
                <View style={{ flex: 1 }}>
                  {renderDistributionChart(user?.hypeDistribution || {}, 'hype')}
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, textAlign: 'center' }}>{user?.totalHype || 0} fights</Text>
                </View>
              </View>
            </View>
          )}

          {/* My Comments (Pre-Fight) */}
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FontAwesome name="comments" size={18} color={colors.text} />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, textTransform: 'uppercase', letterSpacing: 2 }}>My Comments</Text>
              </View>
              {filteredTopPreflightComments?.comments && filteredTopPreflightComments.comments.length > 0 && (
                <TouchableOpacity
                  onPress={() => router.push('/activity/my-preflight-comments' as any)}
                  style={{ position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>See All</Text>
                  <FontAwesome name="chevron-right" size={10} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            {!filteredTopPreflightComments?.comments || filteredTopPreflightComments.comments.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8, textAlign: 'center' }}>
                {selectedOrgs.size > 0
                  ? `No hype comments for ${Array.from(selectedOrgs).join(' or ')} fights`
                  : 'None yet.'}
              </Text>
            ) : (
              <View>
                {filteredTopPreflightComments.comments.map((comment) => (
                  <View key={comment.id} style={{ marginBottom: 8 }}>
                    <PreFightCommentCard
                      comment={{
                        id: comment.id,
                        content: comment.content,
                        hypeRating: comment.hypeRating,
                        predictedWinner: comment.predictedWinner,
                        upvotes: comment.upvotes,
                        userHasUpvoted: comment.userHasUpvoted,
                        user: { displayName: 'Me' },
                        fight: comment.fight ? {
                          id: comment.fight.id,
                          fighter1Name: comment.fight.fighter1Name,
                          fighter2Name: comment.fight.fighter2Name,
                          eventName: comment.fight.eventName,
                        } : undefined,
                      }}
                      fighter1Id={comment.fight?.fighter1Id}
                      fighter2Id={comment.fight?.fighter2Id}
                      fighter1Name={comment.fight?.fighter1Name}
                      fighter2Name={comment.fight?.fighter2Name}
                      onPress={() => router.push(`/fight/${comment.fight?.id}${comment.fight?.isComplete ? '?mode=completed' : ''}` as any)}
                      onUpvote={() => handleUpvotePreflight(comment.fightId, comment.id)}
                      isUpvoting={upvotingPreflightId === comment.id}
                      isAuthenticated={isAuthenticated}
                      showMyComment={true}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </SectionContainer>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {/* Hidden for launch - notifications not ready */}
          {false && (
          <TouchableOpacity
            style={[styles.actionButtonFull, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/settings')}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="bell" size={18} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Notification Settings</Text>
            </View>
          </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionButtonFull, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/edit-profile')}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="user" size={18} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Edit Profile</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButtonFull, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={() => router.push('/send-feedback')}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="comment" size={18} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Send Feedback</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButtonFull, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            onPress={handleLogout}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="sign-out" size={18} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 4,
    paddingTop: 0,
    paddingBottom: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 0,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  predictionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  predictionLabel: {
    fontSize: 14,
  },
  predictionValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  flamesContainer: {
    flexDirection: 'row',
    gap: 13,
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  fightsRatedText: {
    fontSize: 12,
  },
  distributionContainer: {
    width: '100%',
  },
  distributionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyChartMessage: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 82,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    marginHorizontal: 0.5,
  },
  barWrapper: {
    width: '100%',
    height: 82,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 24,
    borderRadius: 1,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 10,
    marginTop: 4,
    color: '#808080',
  },
  barCount: {
    fontSize: 9,
    marginTop: 1,
  },
  ratingIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    width: 90,
    height: 105,
  },
  ratingIconText: {
    position: 'absolute',
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  actionsContainer: {
    marginTop: 8,
    marginHorizontal: 12,
    gap: 11,
  },
  actionButtonFull: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  filterTabsContainer: {
    flexDirection: 'row',
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
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
}); 
