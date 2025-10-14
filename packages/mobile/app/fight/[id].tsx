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
  const { alertState, showConfirm, showSuccess, showError, showInfo, hideAlert } = useCustomAlert();

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

  // Fetch prediction stats for all fights (upcoming and completed)
  const { data: predictionStats, isLoading: predictionStatsLoading, error: predictionStatsError } = useQuery({
    queryKey: ['fightPredictionStats', id],
    queryFn: () => apiService.getFightPredictionStats(id as string),
    enabled: !!id && !!fightData?.fight,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  // Fetch aggregate stats (includes user prediction and community prediction)
  const { data: aggregateStats } = useQuery({
    queryKey: ['fightAggregateStats', id],
    queryFn: () => apiService.getFightAggregateStats(id as string),
    enabled: !!id,
    staleTime: 60 * 1000,
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

  // Determine which rings to show for each fighter
  const getFighterRings = (fighterId: string, fighterName: string, isFighter2: boolean) => {
    const rings = [];

    // Green ring - actual winner (only show if user has rated OR revealed the winner)
    if (fight.winner === fighterId && (fight.userRating || spoilerRevealed)) {
      rings.push('winner');
    }

    // Community prediction ring - yellow for fighter1, gold for fighter2
    if (aggregateStats?.communityPrediction?.winner === fighterName) {
      rings.push(isFighter2 ? 'community-gold' : 'community');
    }

    // Blue ring - user's prediction
    if (aggregateStats?.userPrediction?.winner === fighterName) {
      rings.push('user');
    }

    return rings;
  };

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

  // Helper function to format weight class
  const formatWeightClass = (weightClass: string) => {
    return weightClass
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <DetailScreenHeader
        title={fight ? `${fight.fighter1.lastName} vs ${fight.fighter2.lastName}` : 'Fight Details'}
      />

      <ScrollView style={styles.scrollView}>

        {/* Fighter Matchup - Clickable */}
        <View style={styles.matchupContainer}>
          {/* Fighter 1 */}
          <TouchableOpacity
            style={styles.fighterContainer}
            onPress={() => router.push(`/fighter/${fight.fighter1.id}`)}
          >
            {(() => {
              const fighter1Rings = getFighterRings(
                fight.fighter1.id,
                `${fight.fighter1.firstName} ${fight.fighter1.lastName}`,
                false
              );
              const borderWidth = 3;
              const gap = 2;
              const baseSize = 125;

              return (
                <View style={{ width: baseSize, height: baseSize, marginBottom: 12, position: 'relative' }}>
                  {fighter1Rings.map((ring, index) => {
                    const ringColor = ring === 'winner' ? '#22c55e' : ring === 'community' ? '#F5C518' : ring === 'community-gold' ? '#8A7014' : '#83B4F3';
                    const inset = index * (borderWidth + gap);

                    return (
                      <View
                        key={`${ring}-${index}`}
                        style={{
                          position: 'absolute',
                          top: inset,
                          left: inset,
                          right: inset,
                          bottom: inset,
                          borderWidth: borderWidth,
                          borderColor: ringColor,
                          borderRadius: baseSize / 2,
                          zIndex: index,
                        }}
                      />
                    );
                  })}

                  <Image
                    source={
                      fight.fighter1.profileImage
                        ? { uri: fight.fighter1.profileImage }
                        : getFighterPlaceholderImage(fight.fighter1.id)
                    }
                    style={{
                      width: baseSize,
                      height: baseSize,
                      borderRadius: baseSize / 2,
                      zIndex: 100,
                    }}
                  />
                </View>
              );
            })()}
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fight.fighter1.firstName} {fight.fighter1.lastName}
            </Text>
            {fight.fighter1.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]}>
                "{fight.fighter1.nickname}"
              </Text>
            )}
{fight.fighter1Odds && (
              <Text style={[styles.fighterRecord, { color: colors.textSecondary }]} numberOfLines={1}>
                {fight.fighter1Odds} ({(() => {
                  const odds = parseInt(fight.fighter1Odds);
                  if (odds <= -400) return 'Massive Favorite';
                  if (odds <= -200) return 'Heavy Favorite';
                  if (odds < -110) return 'Favorite';
                  if (odds <= 110) return 'Even';
                  if (odds <= 200) return 'Minor Underdog';
                  if (odds <= 400) return 'Underdog';
                  return 'Major Underdog';
                })()})
              </Text>
            )}
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
            {(() => {
              const fighter2Rings = getFighterRings(
                fight.fighter2.id,
                `${fight.fighter2.firstName} ${fight.fighter2.lastName}`,
                true
              );
              const borderWidth = 3;
              const gap = 2;
              const baseSize = 125;

              return (
                <View style={{ width: baseSize, height: baseSize, marginBottom: 12, position: 'relative' }}>
                  {fighter2Rings.map((ring, index) => {
                    const ringColor = ring === 'winner' ? '#22c55e' : ring === 'community' ? '#F5C518' : ring === 'community-gold' ? '#8A7014' : '#83B4F3';
                    const inset = index * (borderWidth + gap);

                    return (
                      <View
                        key={`${ring}-${index}`}
                        style={{
                          position: 'absolute',
                          top: inset,
                          left: inset,
                          right: inset,
                          bottom: inset,
                          borderWidth: borderWidth,
                          borderColor: ringColor,
                          borderRadius: baseSize / 2,
                          zIndex: index,
                        }}
                      />
                    );
                  })}

                  <Image
                    source={
                      fight.fighter2.profileImage
                        ? { uri: fight.fighter2.profileImage }
                        : getFighterPlaceholderImage(fight.fighter2.id)
                    }
                    style={{
                      width: baseSize,
                      height: baseSize,
                      borderRadius: baseSize / 2,
                      zIndex: 100,
                    }}
                  />
                </View>
              );
            })()}
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fight.fighter2.firstName} {fight.fighter2.lastName}
            </Text>
            {fight.fighter2.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]}>
                "{fight.fighter2.nickname}"
              </Text>
            )}
{fight.fighter2Odds && (
              <Text style={[styles.fighterRecord, { color: colors.textSecondary }]} numberOfLines={1}>
                {fight.fighter2Odds} ({(() => {
                  const odds = parseInt(fight.fighter2Odds);
                  if (odds <= -400) return 'Massive Favorite';
                  if (odds <= -200) return 'Heavy Favorite';
                  if (odds < -110) return 'Favorite';
                  if (odds <= 110) return 'Even';
                  if (odds <= 200) return 'Minor Underdog';
                  if (odds <= 400) return 'Underdog';
                  return 'Major Underdog';
                })()})
              </Text>
            )}
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

        {/* Score Section - Different layout for upcoming vs completed */}
        {isUpcoming ? (
          // Split layout for upcoming fights
          <View style={styles.splitScoreRow}>
            {/* Aggregate Hype - Left */}
            <View style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.scoreRow}>
                <FontAwesome6 name="fire-flame-curved" size={28} color="#FF6B35" />
                <Text style={[styles.halfScoreValue, { color: colors.text }]}>
                  {predictionStats?.averageHype !== undefined
                    ? predictionStats.averageHype % 1 === 0
                      ? predictionStats.averageHype.toString()
                      : predictionStats.averageHype.toFixed(1)
                    : '0'}
                </Text>
              </View>
              <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
                Community Hype
              </Text>
            </View>

            {/* My Hype - Right */}
            <TouchableOpacity
              style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowPredictionModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.scoreRow}>
                <FontAwesome6 name={fight.userHypePrediction ? "fire-flame-curved" : "fire-flame-curved"} size={28} color="#83B4F3" />
                <Text style={[styles.halfScoreValue, { color: colors.text }]}>
                  {fight.userHypePrediction || ''}
                </Text>
              </View>
              <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
                You
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

        {/* Community Predictions - Only for upcoming fights with predictions */}
        {isUpcoming && predictionStats && (
          <CommunityPredictionsCard
            predictionStats={predictionStats}
            userPrediction={fight.userPredictedWinner ? {
              winner: fight.userPredictedWinner === fight.fighter1.id
                ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
                : `${fight.fighter2.firstName} ${fight.fighter2.lastName}`,
              method: fight.userPredictedMethod
            } : null}
            onPress={() => setShowPredictionModal(true)}
          />
        )}

        {/* Fight Details */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Fight Details</Text>

          {/* Event Name */}
          {fight.event?.name && (
            <View style={styles.infoRow}>
              <FontAwesome name="calendar" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {fight.event.name}
              </Text>
            </View>
          )}

          {/* Event Date */}
          {fight.event?.date && (
            <View style={styles.infoRow}>
              <FontAwesome name="calendar-o" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {new Date(fight.event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
              </Text>
            </View>
          )}

          {/* Main Card Start Time */}
          {fight.event?.mainStartTime && (
            <View style={styles.infoRow}>
              <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Main Card: {new Date(fight.event.mainStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
              </Text>
            </View>
          )}

          {/* Prelim Start Time */}
          {fight.event?.prelimStartTime && (
            <View style={styles.infoRow}>
              <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Prelims: {new Date(fight.event.prelimStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
              </Text>
            </View>
          )}

          {/* Early Prelim Start Time */}
          {fight.event?.earlyPrelimStartTime && (
            <View style={styles.infoRow}>
              <FontAwesome name="clock-o" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                Early Prelims: {new Date(fight.event.earlyPrelimStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
              </Text>
            </View>
          )}

          {/* Fighter 1 Stats */}
          <View style={styles.infoRow}>
            <FontAwesome name="user" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {fight.fighter1.firstName} {fight.fighter1.lastName}: {fight.fighter1.wins}-{fight.fighter1.losses}-{fight.fighter1.draws}
              {fight.fighter1Ranking && fight.weightClass && ` (#${fight.fighter1Ranking} ${formatWeightClass(fight.weightClass)})`}
            </Text>
          </View>

          {/* Fighter 2 Stats */}
          <View style={styles.infoRow}>
            <FontAwesome name="user" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {fight.fighter2.firstName} {fight.fighter2.lastName}: {fight.fighter2.wins}-{fight.fighter2.losses}-{fight.fighter2.draws}
              {fight.fighter2Ranking && fight.weightClass && ` (#${fight.fighter2Ranking} ${formatWeightClass(fight.weightClass)})`}
            </Text>
          </View>

          {/* Weight Class */}
          {fight.weightClass && (
            <View style={styles.infoRow}>
              <FontAwesome name="trophy" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {fight.isTitle ? `${formatWeightClass(fight.weightClass)} Championship` : formatWeightClass(fight.weightClass)}
              </Text>
            </View>
          )}

          {/* Event Location */}
          {fight.event?.location && (
            <View style={styles.infoRow}>
              <FontAwesome name="map-marker" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {fight.event.location}
              </Text>
            </View>
          )}

          {/* Arena/Venue */}
          {fight.event?.venue && (
            <View style={styles.infoRow}>
              <FontAwesome name="building-o" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {fight.event.venue}
              </Text>
            </View>
          )}
        </View>

        {/* Distribution Chart - Only for completed fights */}
        {!isUpcoming && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Rating Distribution
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
        )}

        {/* Pre-Fight Predictions (for completed fights) - Read-only */}
        {isComplete && (
          <>
            {/* My Pre-Fight Prediction - Always show */}
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>My Prediction</Text>
              {(fight.userPredictedWinner || fight.userPredictedMethod || fight.userPredictedRound || fight.userHypePrediction) ? (
                <Text style={[styles.myPredictionText, { color: colors.text }]}>
                  {fight.userPredictedWinner && (
                    <>
                      {fight.userPredictedWinner === fight.fighter1.id
                        ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
                        : `${fight.fighter2.firstName} ${fight.fighter2.lastName}`}
                    </>
                  )}
                  {fight.userPredictedMethod && (
                    <> by {fight.userPredictedMethod === 'DECISION' ? 'Decision' : fight.userPredictedMethod === 'KO_TKO' ? 'KO/TKO' : 'Submission'}</>
                  )}
                  {fight.userPredictedRound && (
                    <> in Round {fight.userPredictedRound}</>
                  )}
                  {fight.userHypePrediction && (
                    <> (Hype: {fight.userHypePrediction}/10)</>
                  )}
                </Text>
              ) : (
                <Text style={[styles.noPredictionText, { color: colors.textSecondary }]}>
                  You did not make a prediction for this fight.
                </Text>
              )}
            </View>

            {/* Community Pre-Fight Predictions - Only show if there are predictions */}
            {predictionStats && predictionStats.totalPredictions > 0 && (
              <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Community Predictions</Text>

                {/* Winner Predictions */}
                <View style={styles.predictionSubSection}>
                  <View style={styles.splitBarContainer}>
                    {/* Fighter names above bar */}
                    <View style={styles.fighterNamesRow}>
                      <Text style={[styles.fighterNameLeft, { color: colors.text }]} numberOfLines={1}>
                        {predictionStats.winnerPredictions.fighter1.name}
                      </Text>
                      <Text style={[styles.fighterNameRight, { color: colors.text }]} numberOfLines={1}>
                        {predictionStats.winnerPredictions.fighter2.name}
                      </Text>
                    </View>

                    {/* Single split bar */}
                    <View style={styles.splitBar}>
                      {predictionStats.winnerPredictions.fighter1.percentage > 0 && (
                        <View
                          style={[
                            styles.splitBarLeft,
                            {
                              width: predictionStats.winnerPredictions.fighter2.percentage === 0 ? '100%' : `${predictionStats.winnerPredictions.fighter1.percentage}%`,
                              backgroundColor: '#83B4F3'
                            }
                          ]}
                        >
                          <Text style={styles.splitBarPercentage}>
                            {predictionStats.winnerPredictions.fighter2.percentage === 0 ? '100' : predictionStats.winnerPredictions.fighter1.percentage}%
                          </Text>
                        </View>
                      )}
                      {predictionStats.winnerPredictions.fighter2.percentage > 0 && (
                        <View
                          style={[
                            styles.splitBarRight,
                            {
                              width: predictionStats.winnerPredictions.fighter1.percentage === 0 ? '100%' : `${predictionStats.winnerPredictions.fighter2.percentage}%`,
                              backgroundColor: '#FF6B35'
                            }
                          ]}
                        >
                          <Text style={styles.splitBarPercentage}>
                            {predictionStats.winnerPredictions.fighter1.percentage === 0 ? '100' : predictionStats.winnerPredictions.fighter2.percentage}%
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Per-Fighter Predictions Row */}
                  <View style={styles.predictionTextRow}>
                    {/* Fighter 1 Prediction (Left) */}
                    {(() => {
                      const fighter1Method = (() => {
                        const methodEntries = Object.entries(predictionStats.fighter1MethodPredictions) as [string, number][];
                        const mostPopular = methodEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max, ['DECISION', 0] as [string, number]);
                        return {
                          count: mostPopular[1],
                          label: {
                            'DECISION': 'Decision',
                            'KO_TKO': 'KO/TKO',
                            'SUBMISSION': 'Submission',
                          }[mostPopular[0]] || mostPopular[0],
                        };
                      })();
                      const fighter1Round = (() => {
                        const roundEntries = Object.entries(predictionStats.fighter1RoundPredictions)
                          .map(([round, count]) => [parseInt(round), count] as [number, number])
                          .filter(([_, count]) => count > 0);
                        if (roundEntries.length === 0) return null;
                        const mostPopular = roundEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max, [1, 0] as [number, number]);
                        return { round: mostPopular[0] };
                      })();

                      return fighter1Method.count > 0 && fighter1Round ? (
                        <Text style={[styles.predictionTextLeft, { color: '#83B4F3' }]}>
                          by {fighter1Method.label} in Round {fighter1Round.round}
                        </Text>
                      ) : null;
                    })()}

                    {/* Fighter 2 Prediction (Right) */}
                    {(() => {
                      const fighter2Method = (() => {
                        const methodEntries = Object.entries(predictionStats.fighter2MethodPredictions) as [string, number][];
                        const mostPopular = methodEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max, ['DECISION', 0] as [string, number]);
                        return {
                          count: mostPopular[1],
                          label: {
                            'DECISION': 'Decision',
                            'KO_TKO': 'KO/TKO',
                            'SUBMISSION': 'Submission',
                          }[mostPopular[0]] || mostPopular[0],
                        };
                      })();
                      const fighter2Round = (() => {
                        const roundEntries = Object.entries(predictionStats.fighter2RoundPredictions)
                          .map(([round, count]) => [parseInt(round), count] as [number, number])
                          .filter(([_, count]) => count > 0);
                        if (roundEntries.length === 0) return null;
                        const mostPopular = roundEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max, [1, 0] as [number, number]);
                        return { round: mostPopular[0] };
                      })();

                      return fighter2Method.count > 0 && fighter2Round ? (
                        <Text style={[styles.predictionTextRight, { color: '#FF6B35' }]}>
                          {fighter2Method.label} in Round {fighter2Round.round}
                        </Text>
                      ) : null;
                    })()}
                  </View>

                  <Text style={[styles.predictionSubtext, { color: colors.textSecondary }]}>
                    {predictionStats.totalPredictions} {predictionStats.totalPredictions === 1 ? 'prediction' : 'predictions'}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

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
    width: 125,
    height: 125,
    borderRadius: 62.5,
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
  fighterOdds: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  vsContainer: {
    paddingHorizontal: 8,
  },
  vsText: {
    fontSize: 16,
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
    marginHorizontal: 4,
    marginBottom: 16,
    gap: 12,
  },
  halfScoreContainer: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  halfScoreValue: {
    fontSize: 36,
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
  myPredictionText: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  noPredictionText: {
    fontSize: 15,
    fontStyle: 'italic',
  },
  predictButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  predictButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginHorizontal: 4,
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
  predictionSubSection: {
    marginBottom: 8,
  },
  splitBarContainer: {
    gap: 8,
    marginBottom: 8,
  },
  fighterNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  fighterNameLeft: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
  },
  fighterNameRight: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  splitBar: {
    flexDirection: 'row',
    height: 32,
    borderRadius: 6,
    overflow: 'hidden',
  },
  splitBarLeft: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitBarRight: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitBarPercentage: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
  },
  predictionSubtext: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  predictionTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: -6,
    paddingHorizontal: 4,
  },
  predictionTextLeft: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'left',
    flex: 1,
  },
  predictionTextRight: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
  },
});
