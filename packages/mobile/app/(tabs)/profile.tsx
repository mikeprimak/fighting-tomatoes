import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColorScheme } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { CustomAlert } from '../../components/CustomAlert';
import { CommentCard } from '../../components';
import { getHypeHeatmapColor } from '../../utils/heatmap';
import { api, apiService } from '../../services/api';
import * as Haptics from 'expo-haptics';
import PredictionAccuracyChart from '../../components/PredictionAccuracyChart';
import SectionContainer from '../../components/SectionContainer';

interface EventAccuracy {
  eventId: string;
  eventName: string;
  eventDate: string;
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
    fighter1Name: string;
    fighter2Name: string;
    eventName: string;
    eventDate: string;
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

  // Time filter state
  const [timeFilter, setTimeFilter] = useState<string>('3months');
  const timeFilterOptions = [
    { key: 'lastEvent', label: 'Last Event' },
    { key: 'month', label: 'Month' },
    { key: '3months', label: '3 mo.' },
    { key: 'year', label: 'Year' },
    { key: 'allTime', label: 'All Time' },
  ];

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

  // Fetch user's top upvoted reviews
  useEffect(() => {
    const fetchTopReviews = async () => {
      try {
        const data = await api.getMyTopReviews(3);
        if (data && data.reviews) {
          setTopReviews(data);
        }
      } catch (error) {
        // Silently fail - endpoint may not exist yet
        console.log('Top reviews not available:', error);
      }
    };

    if (user) {
      fetchTopReviews();
    }
  }, [user?.id]);

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

  const styles = createStyles(colors);

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
              <View key={rating} style={styles.barContainer}>
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
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Predictions Section */}
        <SectionContainer
          title="My Fight Predictions"
          icon="trophy"
          iconColor="#fff"
          headerBgColor="#166534"
          containerBgColorDark="rgba(34, 197, 94, 0.05)"
          containerBgColorLight="rgba(34, 197, 94, 0.08)"
        >
          {(predictionAccuracy.totalCorrect + predictionAccuracy.totalIncorrect) === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8 }}>
              Make fight predictions on the "Upcoming" screen. Check in after the event to see how you did!
            </Text>
          ) : (
            <>
              {/* Time Filter Buttons */}
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
                      {(predictionAccuracy.totalCorrect + predictionAccuracy.totalIncorrect) > 0
                        ? `${Math.round((predictionAccuracy.totalCorrect / (predictionAccuracy.totalCorrect + predictionAccuracy.totalIncorrect)) * 100)}%`
                        : '—'}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      ({predictionAccuracy.totalCorrect}/{predictionAccuracy.totalCorrect + predictionAccuracy.totalIncorrect})
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
                data={predictionAccuracy.accuracyByEvent}
                totalCorrect={predictionAccuracy.totalCorrect}
                totalIncorrect={predictionAccuracy.totalIncorrect}
              />
            </>
          )}
        </SectionContainer>

        {/* Average Hype */}
        <SectionContainer
          title="My Average Hype"
          icon="fire-flame-curved"
          iconFamily="fontawesome6"
          iconColor="#000"
          headerBgColor="#F5C518"
          containerBgColorDark="rgba(245, 197, 24, 0.05)"
          containerBgColorLight="rgba(245, 197, 24, 0.08)"
        >
          <View style={{ height: 10 }} />
          {!user?.totalHype ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8 }}>
              Choose how Hyped you are for upcoming fights on the "Upcoming" screen. You'll see your data here.
            </Text>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9 }}>
                {/* Large Flame Icon */}
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

                {/* Distribution Chart */}
                <View style={{ flex: 1 }}>
                  {renderDistributionChart(user?.hypeDistribution || {}, 'hype')}
                </View>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 14, textAlign: 'center' }}>({user?.totalHype || 0} fights)</Text>
            </View>
          )}
        </SectionContainer>

        {/* My Comments (Post-Fight) */}
        <SectionContainer
          title="My Comments (Post-Fight)"
          icon="comment"
          iconColor="#fff"
          headerBgColor="#3B82F6"
          containerBgColorDark="rgba(59, 130, 246, 0.05)"
          containerBgColorLight="rgba(59, 130, 246, 0.08)"
        >
          {!topReviews?.reviews || topReviews.reviews.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8 }}>
              Write comments on completed fights. Your most upvoted comments will appear here!
            </Text>
          ) : (
            <View>
              {topReviews.reviews.map((review) => (
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
                    onPress={() => router.push(`/fight/${review.fight?.id}` as any)}
                    onUpvote={() => handleUpvote(review.fightId, review.id)}
                    isUpvoting={upvotingReviewId === review.id}
                    isAuthenticated={isAuthenticated}
                    showMyReview={true}
                  />
                </View>
              ))}
              {(topReviews.totalWithUpvotes || 0) > 3 && (
                <TouchableOpacity
                  style={styles.seeAllButton}
                  onPress={() => router.push('/activity/my-comments' as any)}
                >
                  <Text style={[styles.seeAllText, { color: colors.primary }]}>
                    See All ({topReviews.totalWithUpvotes})
                  </Text>
                  <FontAwesome name="chevron-right" size={12} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </SectionContainer>

        {/* Average Rating */}
        <SectionContainer
          title="My Average Rating"
          icon="star"
          iconColor="#000"
          headerBgColor="#F5C518"
          containerBgColorDark="rgba(245, 197, 24, 0.05)"
          containerBgColorLight="rgba(245, 197, 24, 0.08)"
        >
          <View style={{ height: 10 }} />
          {!user?.totalRatings ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingVertical: 8 }}>
              Rate how much you liked fights on the "Past Events" screen.
            </Text>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9 }}>
                {/* Large Star Icon */}
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

                {/* Distribution Chart */}
                <View style={{ flex: 1 }}>
                  {renderDistributionChart(user?.ratingDistribution || {}, 'rating')}
                </View>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 14, textAlign: 'center' }}>({user?.totalRatings || 0} fights)</Text>
            </View>
          )}
        </SectionContainer>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <View style={styles.actionButtonsGrid}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
              onPress={() => router.push('/activity/ratings')}
            >
              <View style={styles.actionButtonContent}>
                <FontAwesome name="history" size={18} color={colors.text} />
                <Text style={[styles.actionButtonText, { color: colors.text }]}>My Activity</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
              onPress={() => router.push('/settings')}
            >
              <View style={styles.actionButtonContent}>
                <FontAwesome name="bell" size={18} color={colors.text} />
                <Text style={[styles.actionButtonText, { color: colors.text }]}>Notifications</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
              onPress={() => router.push('/edit-profile')}
            >
              <View style={styles.actionButtonContent}>
                <FontAwesome name="user" size={18} color={colors.text} />
                <Text style={[styles.actionButtonText, { color: colors.text }]}>Edit Profile</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
              onPress={() => router.push('/send-feedback')}
            >
              <View style={styles.actionButtonContent}>
                <FontAwesome name="comment" size={18} color={colors.text} />
                <Text style={[styles.actionButtonText, { color: colors.text }]}>Send Feedback</Text>
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: colors.primary }]}
            onPress={handleLogout}
          >
            <View style={styles.actionButtonContent}>
              <FontAwesome name="sign-out" size={18} color={colors.textOnAccent} />
              <Text style={[styles.logoutButtonText, { color: colors.textOnAccent }]}>Sign Out</Text>
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
    paddingTop: 25,
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
  },
  actionButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 13,
  },
  actionButton: {
    width: '48%',
    paddingVertical: 24,
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
    marginTop: 11,
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
