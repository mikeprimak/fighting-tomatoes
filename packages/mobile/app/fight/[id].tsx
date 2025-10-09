import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Image,
  useColorScheme,
  Animated,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { useAuth } from '../../store/AuthContext';
import { RateFightModal, PredictionModal, DetailScreenHeader, FlagReviewModal, CommunityPredictionsCard } from '../../components';
import { useCustomAlert } from '../../hooks/useCustomAlert';
import { CustomAlert } from '../../components/CustomAlert';

// Placeholder image selection for fighters
const getFighterPlaceholderImage = (fighterId: string) => {
  const images = [
    require('../../assets/fighters/fighter-1.jpg'),
    require('../../assets/fighters/fighter-2.jpg'),
    require('../../assets/fighters/fighter-3.jpg'),
    require('../../assets/fighters/fighter-4.jpg'),
    require('../../assets/fighters/fighter-5.jpg'),
    require('../../assets/fighters/fighter-6.jpg'),
  ];
  const lastCharCode = fighterId.charCodeAt(fighterId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export default function FightDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();

  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [animateMyRating, setAnimateMyRating] = useState(false);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [reviewToFlag, setReviewToFlag] = useState<string | null>(null);
  const { alertState, showConfirm, showSuccess, showError, hideAlert } = useCustomAlert();

  // Animation values for My Rating
  const myRatingScaleAnim = useRef(new Animated.Value(1)).current;
  const myRatingGlowAnim = useRef(new Animated.Value(0)).current;
  const star1 = useRef(new Animated.Value(0)).current;
  const star2 = useRef(new Animated.Value(0)).current;
  const star3 = useRef(new Animated.Value(0)).current;
  const star4 = useRef(new Animated.Value(0)).current;
  const star5 = useRef(new Animated.Value(0)).current;
  const star6 = useRef(new Animated.Value(0)).current;
  const star7 = useRef(new Animated.Value(0)).current;
  const star8 = useRef(new Animated.Value(0)).current;

  // Fetch fight details
  const { data: fightData, isLoading: fightLoading, error: fightError } = useQuery({
    queryKey: ['fight', id, isAuthenticated],
    queryFn: () => apiService.getFight(id as string),
    enabled: !!id,
  });

  // Fetch prediction stats for upcoming fights
  const { data: predictionStats } = useQuery({
    queryKey: ['fightPredictionStats', id],
    queryFn: () => apiService.getFightPredictionStats(id as string),
    enabled: !!id && fightData?.fight && !fightData.fight.isComplete && !fightData.fight.hasStarted,
    staleTime: 30 * 1000,
  });

  // Fetch tags
  const { data: tagsData } = useQuery({
    queryKey: ['fightTags', id],
    queryFn: () => apiService.getFightTags(id as string),
    enabled: !!id && !!isAuthenticated && fightData?.fight?.isComplete,
  });

  // Fetch reviews with infinite scroll
  const {
    data: reviewsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['fightReviews', id],
    queryFn: ({ pageParam = 1 }) =>
      apiService.getFightReviews(id as string, { page: pageParam, limit: 10 }),
    enabled: !!id && fightData?.fight?.isComplete,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  // Upvote mutation
  const upvoteMutation = useMutation({
    mutationFn: ({ reviewId }: { reviewId: string }) =>
      apiService.toggleReviewUpvote(id as string, reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fightReviews', id] });
      queryClient.invalidateQueries({ queryKey: ['fight', id] });
    },
  });

  // Flag review mutation
  const flagReviewMutation = useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: string; reason: string }) =>
      apiService.flagReview(id as string, reviewId, reason),
    onSuccess: () => {
      showSuccess('Review has been flagged for moderation');
      setFlagModalVisible(false);
      setReviewToFlag(null);
    },
    onError: (error: any) => {
      showError(error?.error || 'Failed to flag review');
    },
  });

  const handleFlagReview = (reviewId: string) => {
    setReviewToFlag(reviewId);
    setFlagModalVisible(true);
  };

  const submitFlagReview = (reason: string) => {
    if (reviewToFlag) {
      flagReviewMutation.mutate({ reviewId: reviewToFlag, reason });
    }
  };

  // Trigger animation when rating is submitted
  useEffect(() => {
    if (animateMyRating) {
      // Reset all animations
      star1.setValue(0);
      star2.setValue(0);
      star3.setValue(0);
      star4.setValue(0);
      star5.setValue(0);
      star6.setValue(0);
      star7.setValue(0);
      star8.setValue(0);
      myRatingScaleAnim.setValue(1);
      myRatingGlowAnim.setValue(0);

      // Start animations
      Animated.parallel([
        // Scale and glow the rating card
        Animated.sequence([
          Animated.timing(myRatingScaleAnim, {
            toValue: 1.1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(myRatingScaleAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(myRatingGlowAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(myRatingGlowAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        // Stars
        Animated.stagger(80, [
          Animated.timing(star1, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star2, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star3, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star4, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star5, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star6, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star7, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star8, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      ]).start();

      // Reset animation flag after animation completes
      setTimeout(() => setAnimateMyRating(false), 1000);
    }
  }, [animateMyRating]);

  if (fightLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading fight details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (fightError || !fightData?.fight) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.text }]}>
            Failed to load fight details
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.tint }]}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { fight } = fightData;
  const isUpcoming = !fight.hasStarted && !fight.isComplete;
  const isComplete = fight.isComplete;

  // Calculate rating distribution from individual rating fields
  const ratingDistribution: Record<number, number> = {
    1: fight.ratings1 || 0,
    2: fight.ratings2 || 0,
    3: fight.ratings3 || 0,
    4: fight.ratings4 || 0,
    5: fight.ratings5 || 0,
    6: fight.ratings6 || 0,
    7: fight.ratings7 || 0,
    8: fight.ratings8 || 0,
    9: fight.ratings9 || 0,
    10: fight.ratings10 || 0,
  };
  const totalRatings = fight.totalRatings || 0;
  const maxCount = Math.max(...Object.values(ratingDistribution), 1);

  // Calculate prediction distribution
  const predictionDistribution = predictionStats?.distribution || {};
  const totalPredictions = predictionStats?.totalPredictions || 0;
  const maxPredCount = Math.max(...Object.values(predictionDistribution).map((v: any) => v || 0), 1);

  const handleRatingSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['fight', id] });
    queryClient.invalidateQueries({ queryKey: ['fightTags', id] });
    queryClient.invalidateQueries({ queryKey: ['fightReviews', id] });

    // Reveal spoiler when user rates
    setSpoilerRevealed(true);

    // Trigger animation after a short delay
    setTimeout(() => {
      setAnimateMyRating(true);
    }, 300);
  };

  const handlePredictionSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['fight', id] });
    queryClient.invalidateQueries({ queryKey: ['fightPredictionStats', id] });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <DetailScreenHeader
        title={fight ? `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}` : 'Fight Details'}
        subtitle={fight?.event?.name}
      />

      <ScrollView style={styles.scrollView}>

        {/* Weight Class / Championship */}
        {fight.weightClass && (
          <Text style={[styles.weightClassText, fight.isTitle && { color: '#FFD700' }]}>
            {fight.isTitle ? `${fight.weightClass} Championship` : fight.weightClass}
          </Text>
        )}

        {/* Fighter Matchup - Clickable */}
        <View style={styles.matchupContainer}>
          {/* Fighter 1 */}
          <TouchableOpacity
            style={styles.fighterContainer}
            onPress={() => router.push(`/fighter/${fight.fighter1.id}`)}
          >
            <Image
              source={
                fight.fighter1.profileImage
                  ? { uri: fight.fighter1.profileImage }
                  : getFighterPlaceholderImage(fight.fighter1.id)
              }
              style={styles.fighterImage}
            />
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fight.fighter1.firstName} {fight.fighter1.lastName}
            </Text>
            {fight.fighter1.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]}>
                "{fight.fighter1.nickname}"
              </Text>
            )}
            <Text style={[styles.fighterRecord, { color: colors.textSecondary }]}>
              {fight.fighter1.wins}-{fight.fighter1.losses}-{fight.fighter1.draws}
            </Text>
          </TouchableOpacity>

          {/* VS Divider */}
          <View style={styles.vsContainer}>
            <Text style={[styles.vsText, { color: colors.textSecondary }]}>VS</Text>
          </View>

          {/* Fighter 2 */}
          <TouchableOpacity
            style={styles.fighterContainer}
            onPress={() => router.push(`/fighter/${fight.fighter2.id}`)}
          >
            <Image
              source={
                fight.fighter2.profileImage
                  ? { uri: fight.fighter2.profileImage }
                  : getFighterPlaceholderImage(fight.fighter2.id)
              }
              style={styles.fighterImage}
            />
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fight.fighter2.firstName} {fight.fighter2.lastName}
            </Text>
            {fight.fighter2.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]}>
                "{fight.fighter2.nickname}"
              </Text>
            )}
            <Text style={[styles.fighterRecord, { color: colors.textSecondary }]}>
              {fight.fighter2.wins}-{fight.fighter2.losses}-{fight.fighter2.draws}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Outcome (if complete) */}
        {isComplete && fight.winner && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.outcomeContainer}>
              {!fight.userRating && !spoilerRevealed ? (
                // Spoiler protection - hidden view
                <View style={styles.spoilerRow}>
                  <Text style={[styles.winnerText, { color: colors.text }]}>
                    Winner:
                  </Text>
                  <TouchableOpacity
                    style={[styles.revealButton, { backgroundColor: '#83B4F3' }]}
                    onPress={() => setSpoilerRevealed(true)}
                  >
                    <Text style={[styles.revealButtonText, { color: '#000' }]}>Reveal Winner</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                // Normal view (rated or revealed)
                <Text style={[styles.winnerText, { color: colors.text }]}>
                  Winner: {fight.winner === fight.fighter1.id
                    ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
                    : fight.winner === fight.fighter2.id
                    ? `${fight.fighter2.firstName} ${fight.fighter2.lastName}`
                    : fight.winner}
                  {fight.method && ` by ${fight.method}`}
                  {fight.round && ` in Round ${fight.round}`}
                  {fight.time && ` (${fight.time})`}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Community Predictions - Only for upcoming fights with predictions */}
        {isUpcoming && predictionStats && (
          <CommunityPredictionsCard
            predictionStats={predictionStats}
            userPrediction={
              fight.userPredictedWinner || fight.userPredictedMethod || fight.userPredictedRound
                ? {
                    predictedWinner: fight.userPredictedWinner,
                    predictedMethod: fight.userPredictedMethod,
                    predictedRound: fight.userPredictedRound,
                  }
                : undefined
            }
          />
        )}

        {/* Score Section - Different layout for upcoming vs completed */}
        {isUpcoming ? (
          // Split layout for upcoming fights
          <View style={styles.splitScoreRow}>
            {/* Aggregate Hype - Left */}
            <View style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <FontAwesome6 name="fire-flame-curved" size={48} color="#FF6B35" />
              <Text style={[styles.halfScoreValue, { color: colors.text }]}>
                {predictionStats?.averageHype !== undefined
                  ? predictionStats.averageHype % 1 === 0
                    ? predictionStats.averageHype.toString()
                    : predictionStats.averageHype.toFixed(1)
                  : '0'}
              </Text>
              <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
                Average Hype
              </Text>
              <Text style={[styles.halfScoreSubLabel, { color: colors.textSecondary }]}>
                ({totalPredictions} {totalPredictions === 1 ? 'prediction' : 'predictions'})
              </Text>
            </View>

            {/* My Hype - Right */}
            <TouchableOpacity
              style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowPredictionModal(true)}
              activeOpacity={0.7}
            >
              <FontAwesome6 name={fight.userHypePrediction ? "fire-flame-curved" : "fire-flame-curved"} size={48} color="#83B4F3" />
              <Text style={[styles.halfScoreValue, { color: colors.text }]}>
                {fight.userHypePrediction || ''}
              </Text>
              <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
                My Hype
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Split layout for completed fights
          <View style={styles.splitScoreRow}>
            {/* Aggregate Rating - Left */}
            <View style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <FontAwesome name="star" size={48} color="#F5C518" />
              <Text style={[styles.halfScoreValue, { color: colors.text }]}>
                {fight.averageRating
                  ? fight.averageRating % 1 === 0
                    ? fight.averageRating.toString()
                    : fight.averageRating.toFixed(1)
                  : '0'}
              </Text>
              <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
                Average Rating
              </Text>
              <Text style={[styles.halfScoreSubLabel, { color: colors.textSecondary }]}>
                ({totalRatings} {totalRatings === 1 ? 'rating' : 'ratings'})
              </Text>
            </View>

            {/* My Rating - Right */}
            <TouchableOpacity
              style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowRatingModal(true)}
              activeOpacity={0.7}
            >
              <Animated.View
                style={[
                  styles.myRatingContent,
                  {
                    transform: [{ scale: myRatingScaleAnim }],
                    opacity: myRatingGlowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0.8],
                    }),
                  },
                ]}
              >
                <FontAwesome name={fight.userRating ? "star" : "star-o"} size={48} color="#83B4F3" />
                <Text style={[styles.halfScoreValue, { color: colors.text }]}>
                  {fight.userRating || ''}
                </Text>
                <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
                  My Rating
                </Text>

                {/* Star sparkles - 8 stars */}
                {fight.userRating && (
                  <>
                    {/* Top-right star */}
                    <Animated.View style={[
                      styles.sparkle,
                      {
                        top: -10,
                        right: -10,
                        opacity: star1.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1, 0],
                        }),
                        transform: [
                          { scale: star1.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                          { translateX: star1.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                          { translateY: star1.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                        ],
                      }
                    ]}>
                      <FontAwesome name="star" size={12} color="#83B4F3" />
                    </Animated.View>

                    {/* Top-left star */}
                    <Animated.View style={[
                      styles.sparkle,
                      {
                        top: -10,
                        left: -10,
                        opacity: star2.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1, 0],
                        }),
                        transform: [
                          { scale: star2.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                          { translateX: star2.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                          { translateY: star2.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                        ],
                      }
                    ]}>
                      <FontAwesome name="star" size={12} color="#83B4F3" />
                    </Animated.View>

                    {/* Bottom-right star */}
                    <Animated.View style={[
                      styles.sparkle,
                      {
                        bottom: -10,
                        right: -10,
                        opacity: star3.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1, 0],
                        }),
                        transform: [
                          { scale: star3.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                          { translateX: star3.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                          { translateY: star3.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                        ],
                      }
                    ]}>
                      <FontAwesome name="star" size={12} color="#83B4F3" />
                    </Animated.View>

                    {/* Bottom-left star */}
                    <Animated.View style={[
                      styles.sparkle,
                      {
                        bottom: -10,
                        left: -10,
                        opacity: star4.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1, 0],
                        }),
                        transform: [
                          { scale: star4.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                          { translateX: star4.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                          { translateY: star4.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                        ],
                      }
                    ]}>
                      <FontAwesome name="star" size={12} color="#83B4F3" />
                    </Animated.View>

                    {/* Top center star */}
                    <Animated.View style={[
                      styles.sparkle,
                      {
                        top: -10,
                        left: '50%',
                        marginLeft: -6,
                        opacity: star5.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1, 0],
                        }),
                        transform: [
                          { scale: star5.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                          { translateY: star5.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                        ],
                      }
                    ]}>
                      <FontAwesome name="star" size={12} color="#83B4F3" />
                    </Animated.View>

                    {/* Right center star */}
                    <Animated.View style={[
                      styles.sparkle,
                      {
                        top: 2,
                        right: -10,
                        opacity: star6.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1, 0],
                        }),
                        transform: [
                          { translateY: 0 },
                          { translateX: star6.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                          { scale: star6.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                        ],
                      }
                    ]}>
                      <FontAwesome name="star" size={12} color="#83B4F3" />
                    </Animated.View>

                    {/* Bottom center star */}
                    <Animated.View style={[
                      styles.sparkle,
                      {
                        bottom: -10,
                        left: '50%',
                        marginLeft: -6,
                        opacity: star7.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1, 0],
                        }),
                        transform: [
                          { scale: star7.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                          { translateY: star7.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                        ],
                      }
                    ]}>
                      <FontAwesome name="star" size={12} color="#83B4F3" />
                    </Animated.View>

                    {/* Left center star */}
                    <Animated.View style={[
                      styles.sparkle,
                      {
                        top: 2,
                        left: -10,
                        opacity: star8.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 1, 0],
                        }),
                        transform: [
                          { translateY: 0 },
                          { translateX: star8.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                          { scale: star8.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                        ],
                      }
                    ]}>
                      <FontAwesome name="star" size={12} color="#83B4F3" />
                    </Animated.View>
                  </>
                )}
              </Animated.View>
            </TouchableOpacity>
          </View>
        )}

        {/* Large CTA Button - Only for upcoming fights */}
        {isUpcoming && (
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: colors.tint }]}
            onPress={() => setShowPredictionModal(true)}
          >
            <Text style={styles.ctaButtonText}>
              Predict This Fight
            </Text>
          </TouchableOpacity>
        )}

        {/* Distribution Chart */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isUpcoming ? 'Hype Distribution' : 'Rating Distribution'}
          </Text>
          <View style={styles.distributionContainer}>
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => {
              const count = isUpcoming
                ? (predictionDistribution[score] || 0)
                : (ratingDistribution[score] || 0);
              const total = isUpcoming ? totalPredictions : totalRatings;
              const percentage = total > 0 ? (count / total) * 100 : 0;
              const barWidth = total > 0 ? (count / (isUpcoming ? maxPredCount : maxCount)) * 100 : 0;

              return (
                <View key={score} style={styles.distributionRow}>
                  <Text style={[styles.distributionScore, { color: colors.text }]}>{score}</Text>
                  <View style={styles.distributionBarContainer}>
                    <View
                      style={[
                        styles.distributionBar,
                        {
                          width: `${barWidth}%`,
                          backgroundColor: isUpcoming ? '#FF6B35' : '#F5C518',
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.distributionCount, { color: colors.textSecondary }]}>
                    {count} ({percentage.toFixed(0)}%)
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Tags (if complete) */}
        {isComplete && fight.topTags && fight.topTags.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Popular Tags</Text>
            <View style={styles.tagsContainer}>
              {fight.topTags.slice(0, 10).map((tagData: any, index: number) => (
                <View
                  key={index}
                  style={[styles.tag, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={[styles.tagText, { color: colors.text }]}>{tagData.tag.name}</Text>
                  <Text style={[styles.tagCount, { color: colors.textSecondary }]}>
                    {tagData.count}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Reviews (if complete) */}
        {isComplete && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Reviews</Text>

            {/* User's review first (if exists) */}
            {fight.userReview && (
              <View
                style={[styles.reviewCard, styles.myReviewCard, { backgroundColor: colors.background, borderColor: '#83B4F3' }]}
              >
                <View style={styles.reviewContainer}>
                  {/* Left side: Upvote button (interactive) */}
                  <TouchableOpacity
                    style={styles.upvoteButton}
                    onPress={() => upvoteMutation.mutate({ reviewId: fight.userReview.id })}
                    disabled={upvoteMutation.isPending}
                  >
                    <FontAwesome
                      name={fight.userReview.userHasUpvoted ? "thumbs-up" : "thumbs-o-up"}
                      size={18}
                      color={fight.userReview.userHasUpvoted ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.upvoteButtonText,
                        { color: fight.userReview.userHasUpvoted ? colors.primary : colors.textSecondary }
                      ]}
                    >
                      {fight.userReview.upvotes || 0}
                    </Text>
                  </TouchableOpacity>

                  {/* Right side: Review content */}
                  <View style={styles.reviewContentContainer}>
                    <View style={styles.reviewHeader}>
                      <Text style={[styles.reviewAuthor, { color: colors.text }]}>
                        My Review
                      </Text>
                      <View style={styles.reviewRating}>
                        <FontAwesome name="star" size={14} color="#F5C518" />
                        <Text style={[styles.reviewRatingText, { color: colors.text }]}>
                          {fight.userReview.rating}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.reviewContent, { color: colors.textSecondary }]}>
                      {fight.userReview.content}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Other reviews with infinite scroll */}
            {reviewsData?.pages[0]?.reviews && reviewsData.pages[0].reviews.length > 0 ? (
              <>
                {reviewsData.pages.flatMap(page =>
                  page.reviews.filter((review: any) => review.userId !== user?.id)
                ).map((review: any) => (
                  <View
                    key={review.id}
                    style={[styles.reviewCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                  >
                    <View style={styles.reviewContainer}>
                      {/* Left side: Upvote button */}
                      <TouchableOpacity
                        style={styles.upvoteButton}
                        onPress={() => upvoteMutation.mutate({ reviewId: review.id })}
                        disabled={!isAuthenticated || upvoteMutation.isPending}
                      >
                        <FontAwesome
                          name={review.userHasUpvoted ? "thumbs-up" : "thumbs-o-up"}
                          size={18}
                          color={review.userHasUpvoted ? colors.primary : colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.upvoteButtonText,
                            { color: review.userHasUpvoted ? colors.primary : colors.textSecondary }
                          ]}
                        >
                          {review.upvotes || 0}
                        </Text>
                      </TouchableOpacity>

                      {/* Right side: Review content */}
                      <View style={styles.reviewContentContainer}>
                        <View style={styles.reviewHeader}>
                          <Text style={[styles.reviewAuthor, { color: colors.text }]}>
                            {review.user.displayName || `${review.user.firstName} ${review.user.lastName}`}
                          </Text>
                          <View style={styles.reviewHeaderRight}>
                            <View style={styles.reviewRating}>
                              <FontAwesome name="star" size={14} color="#F5C518" />
                              <Text style={[styles.reviewRatingText, { color: colors.text }]}>
                                {review.rating}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => handleFlagReview(review.id)}
                              disabled={!isAuthenticated || flagReviewMutation.isPending}
                              style={styles.flagButton}
                            >
                              <FontAwesome
                                name="flag"
                                size={14}
                                color={review.userHasFlagged ? '#ef4444' : colors.textSecondary}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text style={[styles.reviewContent, { color: colors.textSecondary }]}>
                          {review.content}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}

                {/* Load more button */}
                {hasNextPage && (
                  <TouchableOpacity
                    style={[styles.loadMoreButton, { backgroundColor: colors.primary }]}
                    onPress={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.loadMoreButtonText}>Load More</Text>
                    )}
                  </TouchableOpacity>
                )}
              </>
            ) : !fight.userReview && (
              <Text style={[styles.noReviewsText, { color: colors.textSecondary }]}>
                No reviews yet. Be the first to review this fight!
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      <RateFightModal
        visible={showRatingModal}
        fight={fight}
        onClose={() => setShowRatingModal(false)}
        onSuccess={handleRatingSuccess}
      />

      <PredictionModal
        visible={showPredictionModal}
        fight={fight}
        onClose={() => setShowPredictionModal(false)}
        onSuccess={handlePredictionSuccess}
      />

      <FlagReviewModal
        visible={flagModalVisible}
        onClose={() => setFlagModalVisible(false)}
        onSubmit={submitFlagReview}
        isLoading={flagReviewMutation.isPending}
        colorScheme={colorScheme}
      />

      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  weightClassText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
    color: '#999',
  },
  matchupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  fighterContainer: {
    flex: 1,
    alignItems: 'center',
  },
  fighterImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
  },
  fighterName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  fighterNickname: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  fighterRecord: {
    fontSize: 14,
    marginTop: 4,
  },
  vsContainer: {
    paddingHorizontal: 16,
  },
  vsText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  largeScoreContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  largeScoreValue: {
    fontSize: 64,
    fontWeight: 'bold',
  },
  largeScoreLabel: {
    fontSize: 16,
    textAlign: 'center',
  },
  splitScoreRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  halfScoreContainer: {
    flex: 1,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  halfScoreValue: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  halfScoreLabel: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  halfScoreSubLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  ctaButton: {
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  distributionContainer: {
    gap: 8,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  distributionScore: {
    fontSize: 14,
    fontWeight: '600',
    width: 20,
  },
  distributionBarContainer: {
    flex: 1,
    height: 24,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  distributionBar: {
    height: '100%',
    borderRadius: 4,
  },
  distributionCount: {
    fontSize: 12,
    width: 70,
    textAlign: 'right',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    marginLeft: 12,
    flex: 1,
  },
  outcomeContainer: {
    gap: 8,
  },
  spoilerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  revealButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  revealButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  winnerText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  methodText: {
    fontSize: 15,
  },
  roundText: {
    fontSize: 15,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  tagText: {
    fontSize: 14,
  },
  tagCount: {
    fontSize: 12,
  },
  reviewCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  reviewContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  reviewContentContainer: {
    flex: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewAuthor: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flagButton: {
    padding: 4,
  },
  reviewRatingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  myRatingContent: {
    alignItems: 'center',
    gap: 8,
  },
  sparkle: {
    position: 'absolute',
    zIndex: 10,
  },
  myReviewCard: {
    borderWidth: 2,
  },
  noReviewsText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  loadMoreButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  loadMoreButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  upvoteButton: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 50,
  },
  upvoteButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  upvoteCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upvoteCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
