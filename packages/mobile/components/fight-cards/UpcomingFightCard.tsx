import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { router } from 'expo-router';
import { useAuth } from '../../store/AuthContext';
import { BaseFightCardProps } from './shared/types';
import { getFighterImage, getFighterName, cleanFighterName, formatDate, getLastName } from './shared/utils';
import { sharedStyles } from './shared/styles';
import { LinearGradient } from 'expo-linear-gradient';

interface UpcomingFightCardProps extends BaseFightCardProps {
  isNextFight?: boolean;
  hasLiveFight?: boolean;
  lastCompletedFightTime?: string;
  animatePrediction?: boolean;
}

export default function UpcomingFightCard({
  fight,
  onPress,
  showEvent = true,
  isNextFight = false,
  hasLiveFight = false,
  lastCompletedFightTime,
  animatePrediction = false,
}: UpcomingFightCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Local formatMethod function for this component - shows "KO" instead of "KO/TKO"
  const formatMethod = (method: string | null | undefined) => {
    if (!method) return '';
    if (method === 'KO_TKO') return 'KO';
    if (method === 'DECISION') return 'Decision';
    if (method === 'SUBMISSION') return 'Submission';
    return method;
  };

  // Image error states
  const [fighter1ImageError, setFighter1ImageError] = useState(false);
  const [fighter2ImageError, setFighter2ImageError] = useState(false);

  // Bell notification state
  const [toastMessage, setToastMessage] = useState<string>('');
  const bellRotation = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(50)).current;

  // Prediction button press state
  const [isPredictionPressed, setIsPredictionPressed] = useState(false);

  // Track when "Up next..." first appeared
  const upNextStartTimeRef = useRef<number | null>(null);

  // Animation for "Starting soon..." text pulse
  const startingSoonPulseAnim = useRef(new Animated.Value(1)).current;

  // Animated values for prediction save animation (flames)
  const predictionScaleAnim = useRef(new Animated.Value(1)).current;
  const predictionGlowAnim = useRef(new Animated.Value(0)).current;
  const flame1 = useRef(new Animated.Value(0)).current;
  const flame2 = useRef(new Animated.Value(0)).current;
  const flame3 = useRef(new Animated.Value(0)).current;
  const flame4 = useRef(new Animated.Value(0)).current;
  const flame5 = useRef(new Animated.Value(0)).current;
  const flame6 = useRef(new Animated.Value(0)).current;
  const flame7 = useRef(new Animated.Value(0)).current;
  const flame8 = useRef(new Animated.Value(0)).current;

  // Animated value for hot fight flame glow
  const hotFightGlowAnim = useRef(new Animated.Value(0)).current;

  // Fetch aggregate prediction stats
  const { data: predictionStats } = useQuery({
    queryKey: ['fightPredictionStats', fight.id],
    queryFn: () => apiService.getFightPredictionStats(fight.id),
    staleTime: 30 * 1000,
  });

  // Fetch aggregate stats (includes user prediction and community prediction)
  const { data: aggregateStats } = useQuery({
    queryKey: ['fightAggregateStats', fight.id],
    queryFn: () => apiService.getFightAggregateStats(fight.id),
    staleTime: 60 * 1000,
  });

  // Bell ringing animation
  const animateBellRing = () => {
    bellRotation.setValue(0);
    Animated.sequence([
      Animated.timing(bellRotation, { toValue: 1, duration: 100, useNativeDriver: true }),
      Animated.timing(bellRotation, { toValue: -1, duration: 100, useNativeDriver: true }),
      Animated.timing(bellRotation, { toValue: 1, duration: 100, useNativeDriver: true }),
      Animated.timing(bellRotation, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  // Toast notification animation
  const showToast = (message: string) => {
    setToastMessage(message);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(50); // Start from below

    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }), // Slide up to center (no offset)
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]).start(() => setToastMessage(''));
    }, 1400);
  };

  // Follow/Unfollow mutation
  const followMutation = useMutation({
    mutationFn: async (isCurrentlyFollowing: boolean) => {
      if (isCurrentlyFollowing) {
        return await apiService.unfollowFight(fight.id);
      } else {
        return await apiService.followFight(fight.id);
      }
    },
    onSuccess: async (data) => {
      animateBellRing();
      if (data.isFollowing) {
        showToast('You will be notified before this fight.');
      }
      await queryClient.invalidateQueries({ queryKey: ['fights'] });
      await queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
      await queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      await queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
    },
  });

  const handleBellPress = (e: any) => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    followMutation.mutate(fight.isFollowing || false);
  };

  // Get status message
  const getUpcomingStatusMessage = () => {
    if (!isNextFight || fight.hasStarted || fight.isComplete) {
      upNextStartTimeRef.current = null;
      return null;
    }

    if (hasLiveFight) {
      upNextStartTimeRef.current = null;
      return null;
    }

    if (!upNextStartTimeRef.current && lastCompletedFightTime) {
      upNextStartTimeRef.current = Date.now();
    }

    if (upNextStartTimeRef.current) {
      const secondsSinceStart = (Date.now() - upNextStartTimeRef.current) / 1000;
      if (secondsSinceStart < 15) {
        return 'Up next...';
      } else {
        return 'Starting soon...';
      }
    }

    return null;
  };

  // Force re-render every second for next fight
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (isNextFight && !hasLiveFight && !fight.hasStarted) {
      const interval = setInterval(forceUpdate, 1000);
      return () => clearInterval(interval);
    }
  }, [isNextFight, hasLiveFight, fight.hasStarted]);

  // Reset image errors
  useEffect(() => {
    setFighter1ImageError(false);
    setFighter2ImageError(false);
  }, [fight.id]);

  // Pulsing animation for "Starting soon..."
  useEffect(() => {
    const statusMessage = getUpcomingStatusMessage();
    if (statusMessage === 'Starting soon...') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(startingSoonPulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
          Animated.timing(startingSoonPulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => {
        pulse.stop();
        startingSoonPulseAnim.setValue(1);
      };
    }
  }, [getUpcomingStatusMessage(), startingSoonPulseAnim]);

  // Trigger flame animation when prediction is saved
  useEffect(() => {
    if (animatePrediction && fight.userHypePrediction) {
      // Reset flames
      flame1.setValue(0);
      flame2.setValue(0);
      flame3.setValue(0);
      flame4.setValue(0);
      flame5.setValue(0);
      flame6.setValue(0);
      flame7.setValue(0);
      flame8.setValue(0);

      Animated.parallel([
        Animated.sequence([
          Animated.timing(predictionScaleAnim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
          Animated.spring(predictionScaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(predictionGlowAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(predictionGlowAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.timing(flame1, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(flame2, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(flame3, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(flame4, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(flame5, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(flame6, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(flame7, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(flame8, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
    }
  }, [animatePrediction, fight.userHypePrediction, predictionScaleAnim, predictionGlowAnim, flame1, flame2, flame3, flame4, flame5, flame6, flame7, flame8]);

  // Pulsing glow animation for hot fights (8+ hype)
  useEffect(() => {
    if (predictionStats?.averageHype && predictionStats.averageHype >= 8) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(hotFightGlowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(hotFightGlowAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => {
        pulse.stop();
        hotFightGlowAnim.setValue(0);
      };
    }
  }, [predictionStats?.averageHype, hotFightGlowAnim]);

  const getFighter1ImageSource = () => {
    if (fighter1ImageError) {
      return require('../../assets/fighters/fighter-default-alpha.png');
    }
    return getFighterImage(fight.fighter1);
  };

  const getFighter2ImageSource = () => {
    if (fighter2ImageError) {
      return require('../../assets/fighters/fighter-default-alpha.png');
    }
    return getFighterImage(fight.fighter2);
  };

  // Determine which rings to show for each fighter (only community and user, no winner)
  const getFighterRings = (fighterId: string, fighterName: string, isFighter2: boolean) => {
    const rings = [];

    // Community prediction ring - yellow for both fighters
    if (aggregateStats?.communityPrediction?.winner === fighterName) {
      rings.push('community');
    }

    // Blue ring - user's prediction
    if (aggregateStats?.userPrediction?.winner === fighterName) {
      rings.push('user');
    }

    return rings;
  };

  // Helper function to find top methods with their percentages
  const getTopMethods = (methods: { DECISION: number; KO_TKO: number; SUBMISSION: number }) => {
    const methodEntries = Object.entries(methods) as [string, number][];
    const total = methodEntries.reduce((sum, [_, count]) => sum + count, 0);

    if (total === 0) return [];

    // Sort by count descending
    const sorted = methodEntries
      .map(([method, count]) => ({
        method,
        count,
        percentage: Math.round((count / total) * 100),
        label: {
          'DECISION': 'Decision',
          'KO_TKO': 'KO',
          'SUBMISSION': 'Sub',
        }[method] || method,
      }))
      .filter(m => m.count > 0)
      .sort((a, b) => b.count - a.count);

    // Return top method, plus second if it's 33% or more
    const result = [sorted[0]];
    if (sorted[1] && sorted[1].percentage >= 33) {
      result.push(sorted[1]);
    }

    return result;
  };

  return (
    <TouchableOpacity onPress={() => onPress(fight)} activeOpacity={0.7}>
      <View style={[sharedStyles.container, { backgroundColor: colors.card, position: 'relative' }]}>
        {fight.isTitle && (
          <Text style={[sharedStyles.titleLabel, { color: colors.tint }]}>
            TITLE FIGHT
          </Text>
        )}

        {predictionStats?.averageHype && predictionStats.averageHype >= 8 && (
          <View style={styles.hotFightBadge}>
            <Text style={styles.hotFightText}>🔥 HOT FIGHT</Text>
          </View>
        )}

          {showEvent && (
            <Text style={[sharedStyles.eventText, { color: colors.textSecondary }]}>
              {fight.event.name} • {formatDate(fight.event.date)}
            </Text>
          )}

          <View style={styles.fighterNamesRow}>
            <Text style={[styles.fighterNameLeft, { color: colors.text }]} numberOfLines={1}>
              {cleanFighterName(getFighterName(fight.fighter1))}
            </Text>
            <Text style={[styles.vsText, { color: colors.textSecondary }]}>
              vs
            </Text>
            <Text style={[styles.fighterNameRight, { color: colors.text }]} numberOfLines={1}>
              {cleanFighterName(getFighterName(fight.fighter2))}
            </Text>
          </View>

        {/* Fighter Headshots with Rings and Odds */}
        <View style={styles.headshotsWithOddsContainer}>
            {/* Fighter 1 with rings */}
            {(() => {
              const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
              const fighter1Rings = getFighterRings(fight.fighter1.id, fighter1Name, false);
              const baseSize = 75;
              const borderWidth = 3;
              const gap = 1;

              return (
                <View style={styles.fighterColumn}>
                  <View style={sharedStyles.fighterHeadshotWrapper}>
                    {fighter1Rings.map((ring, index) => {
                      const ringColor = ring === 'community' ? '#F5C518' : '#83B4F3';
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
                            borderRadius: 37.5,
                            zIndex: index,
                          }}
                        />
                      );
                    })}

                    <Image
                      source={getFighter1ImageSource()}
                      style={{
                        width: baseSize,
                        height: baseSize,
                        borderRadius: baseSize / 2,
                        zIndex: 100,
                      }}
                      onError={() => setFighter1ImageError(true)}
                    />
                  </View>
                  {fight.fighter1Odds && (
                    <Text style={[styles.oddsText, { color: colors.textSecondary }]}>
                      {fight.fighter1Odds}
                    </Text>
                  )}
                  {/* User prediction method - blue */}
                  {aggregateStats?.userPrediction?.winner === fighter1Name && aggregateStats?.userPrediction?.method && (
                    <Text style={[styles.methodText, { color: '#83B4F3' }]}>
                      {formatMethod(aggregateStats.userPrediction.method)}
                    </Text>
                  )}
                  {/* Community prediction method - yellow */}
                  {aggregateStats?.communityPrediction?.winner === fighter1Name && (() => {
                    if (!predictionStats) return null;
                    const topMethods = getTopMethods(predictionStats.fighter1MethodPredictions);
                    if (topMethods.length === 0) return null;
                    return (
                      <Text style={[styles.methodText, { color: '#F5C518' }]}>
                        {topMethods.map(m => m.label).join(' or ')}
                      </Text>
                    );
                  })()}
                </View>
              );
            })()}

            {/* Hype Scores - Centered between fighters */}
            <View style={styles.centeredHypeScores}>
              {/* Community Hype Score */}
              <View style={styles.aggregateScoreContainer}>
                <Animated.View
                  style={{
                    transform: predictionStats?.averageHype && predictionStats.averageHype >= 8 ? [{
                      scale: hotFightGlowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.15]
                      })
                    }] : [],
                  }}
                >
                  <FontAwesome6
                    name="fire-flame-curved"
                    size={20}
                    color="#FF6B35"
                    style={sharedStyles.ratingIcon}
                  />
                </Animated.View>
                <Text style={[sharedStyles.aggregateLabel, { color: '#fff' }]}>
                  {predictionStats?.averageHype !== undefined
                    ? (predictionStats.averageHype % 1 === 0 ? predictionStats.averageHype.toString() : predictionStats.averageHype.toFixed(1))
                    : '0'
                  }
                </Text>
              </View>

              {/* User's Personal Hype Score with Flame Sparkles */}
              <View style={styles.userHypeContainer}>
                {/* Flame sparkles */}
                {fight.userHypePrediction && (
                  <>
                    {[flame1, flame2, flame3, flame4, flame5, flame6, flame7, flame8].map((flame, index) => {
                      const positions = [
                        { top: -10, right: -10, tx: 15, ty: -15 },
                        { top: -10, left: -10, tx: -15, ty: -15 },
                        { bottom: -10, right: -10, tx: 15, ty: 15 },
                        { bottom: -10, left: -10, tx: -15, ty: 15 },
                        { top: -10, left: 0, right: 0, tx: 0, ty: -20 },
                        { top: 2, right: -10, tx: 20, ty: 0 },
                        { bottom: -10, left: 0, right: 0, tx: 0, ty: 20 },
                        { top: 2, left: -10, tx: -20, ty: 0 },
                      ];
                      const pos = positions[index] as any;

                      return (
                        <Animated.View
                          key={index}
                          style={[
                            sharedStyles.sparkle,
                            pos,
                            {
                              opacity: flame.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
                              transform: [
                                { scale: flame.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                                { translateX: flame.interpolate({ inputRange: [0, 1], outputRange: [0, pos.tx] }) },
                                { translateY: flame.interpolate({ inputRange: [0, 1], outputRange: [0, pos.ty] }) },
                              ],
                            },
                          ]}
                        >
                          <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
                        </Animated.View>
                      );
                    })}
                  </>
                )}

                {/* Glow effect */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: '#FF6B35',
                    borderRadius: 20,
                    opacity: predictionGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
                    transform: [{ scale: predictionGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
                  }}
                />

                <Animated.View style={{ transform: [{ scale: predictionScaleAnim }] }}>
                  {fight.userHypePrediction && (
                    <View style={sharedStyles.ratingRow}>
                      <FontAwesome6
                        name="fire-flame-curved"
                        size={20}
                        color="#83B4F3"
                        style={sharedStyles.ratingIcon}
                      />
                      <Text style={[sharedStyles.userRatingText, { color: '#83B4F3', fontSize: 28 }]}>
                        {fight.userHypePrediction}
                      </Text>
                    </View>
                  )}
                </Animated.View>
              </View>
            </View>

            {/* Fighter 2 with rings */}
            {(() => {
              const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
              const fighter2Rings = getFighterRings(fight.fighter2.id, fighter2Name, true);
              const baseSize = 75;
              const borderWidth = 3;
              const gap = 1;

              return (
                <View style={styles.fighterColumn}>
                  <View style={sharedStyles.fighterHeadshotWrapper}>
                    {fighter2Rings.map((ring, index) => {
                      const ringColor = ring === 'community' ? '#F5C518' : '#83B4F3';
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
                            borderRadius: 37.5,
                            zIndex: index,
                          }}
                        />
                      );
                    })}

                    <Image
                      source={getFighter2ImageSource()}
                      style={{
                        width: baseSize,
                        height: baseSize,
                        borderRadius: baseSize / 2,
                        zIndex: 100,
                      }}
                      onError={() => setFighter2ImageError(true)}
                    />
                  </View>
                  {fight.fighter2Odds && (
                    <Text style={[styles.oddsText, { color: colors.textSecondary }]}>
                      {fight.fighter2Odds}
                    </Text>
                  )}
                  {/* User prediction method - blue */}
                  {aggregateStats?.userPrediction?.winner === fighter2Name && aggregateStats?.userPrediction?.method && (
                    <Text style={[styles.methodText, { color: '#83B4F3' }]}>
                      {formatMethod(aggregateStats.userPrediction.method)}
                    </Text>
                  )}
                  {/* Community prediction method - yellow */}
                  {aggregateStats?.communityPrediction?.winner === fighter2Name && (() => {
                    if (!predictionStats) return null;
                    const topMethods = getTopMethods(predictionStats.fighter2MethodPredictions);
                    if (topMethods.length === 0) return null;
                    return (
                      <Text style={[styles.methodText, { color: '#F5C518' }]}>
                        {topMethods.map(m => m.label).join(' or ')}
                      </Text>
                    );
                  })()}
                </View>
              );
            })()}
        </View>


        {/* Status message */}
        {getUpcomingStatusMessage() && (
          <View style={[sharedStyles.outcomeContainer, { marginTop: 8 }]}>
            <Animated.Text
              style={[
                styles.statusText,
                {
                  color: colors.text,
                  opacity: getUpcomingStatusMessage() === 'Starting soon...' ? startingSoonPulseAnim : 1
                }
              ]}
              numberOfLines={1}
            >
              {getUpcomingStatusMessage()}
            </Animated.Text>
          </View>
        )}

        {/* Bell icon - hidden but functionality preserved */}
        {false && isAuthenticated && (
          <TouchableOpacity
            style={styles.bellButton}
            onPress={handleBellPress}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <Animated.View
              style={{
                transform: [{
                  rotate: bellRotation.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ['-15deg', '0deg', '15deg'],
                  }),
                }],
              }}
            >
              <FontAwesome
                name={fight.isFollowing ? "bell" : "bell-o"}
                size={18}
                color={fight.isFollowing ? '#F5C518' : colors.textSecondary}
              />
            </Animated.View>
          </TouchableOpacity>
        )}

        {/* Three dots icon - bottom right - opens fight details */}
        <TouchableOpacity
          style={styles.threeDotsButton}
          onPress={(e) => {
            e.stopPropagation();
            router.push(`/fight/${fight.id}`);
          }}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <FontAwesome name="ellipsis-h" size={27} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Toast Notification */}
        {toastMessage !== '' && (
          <Animated.View
            style={[
              styles.toastContainer,
              {
                backgroundColor: colors.primary,
                opacity: toastOpacity,
                transform: [{ translateY: toastTranslateY }],
              },
            ]}
            pointerEvents="none"
          >
            <View style={styles.toastContent}>
              <FontAwesome name="bell" size={18} color="#1a1a1a" />
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          </Animated.View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hotFightBadge: {
    backgroundColor: '#FF4500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  hotFightText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  headshotsWithOddsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  fighterColumn: {
    alignItems: 'center',
    gap: 4,
  },
  oddsText: {
    fontSize: 11,
    fontWeight: '500',
  },
  methodText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  predictionStatsColumn: {
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  predictionPercentage: {
    fontSize: 14,
    fontWeight: '700',
  },
  predictionMethod: {
    fontSize: 10,
    fontWeight: '500',
  },
  centeredHypeScores: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  aggregateScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 75,
  },
  userHypeContainer: {
    position: 'relative',
    width: 75,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'left',
  },
  bellButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    zIndex: 20,
  },
  threeDotsButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    padding: 8,
    zIndex: 20,
  },
  toastContainer: {
    position: 'absolute',
    bottom: '50%', // Position at center
    left: 16,
    right: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toastText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600',
  },
  predictionBarContainer: {
    marginTop: 3,
    gap: 4,
  },
  fighterNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  fighterNameLeft: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'left',
  },
  vsText: {
    fontSize: 11,
    fontWeight: '400',
    marginHorizontal: 6,
  },
  fighterNameRight: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  splitBar: {
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
  },
  splitBarLeft: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  splitBarRight: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  splitBarContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  splitBarPercentage: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000',
  },
  splitBarMethod: {
    fontSize: 10,
    fontWeight: '500',
    color: '#000',
  },
});
