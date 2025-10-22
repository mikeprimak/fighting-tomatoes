import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions, Alert } from 'react-native';
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
    if (method === 'SUBMISSION') return 'Sub';
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

  // Animated values for fighter image sparkles
  const fighterSparkle1 = useRef(new Animated.Value(0)).current;
  const fighterSparkle2 = useRef(new Animated.Value(0)).current;
  const fighterSparkle3 = useRef(new Animated.Value(0)).current;
  const fighterSparkle4 = useRef(new Animated.Value(0)).current;

  // Animated values for method text sparkles
  const methodSparkle1 = useRef(new Animated.Value(0)).current;
  const methodSparkle2 = useRef(new Animated.Value(0)).current;
  const methodSparkle3 = useRef(new Animated.Value(0)).current;
  const methodSparkle4 = useRef(new Animated.Value(0)).current;

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


  // Trigger animation when prediction is saved (fighter, method, or hype)
  useEffect(() => {
    if (animatePrediction && (fight.userHypePrediction || aggregateStats?.userPrediction?.winner)) {
      // Reset all sparkles
      flame1.setValue(0);
      flame2.setValue(0);
      flame3.setValue(0);
      flame4.setValue(0);
      flame5.setValue(0);
      flame6.setValue(0);
      flame7.setValue(0);
      flame8.setValue(0);
      fighterSparkle1.setValue(0);
      fighterSparkle2.setValue(0);
      fighterSparkle3.setValue(0);
      fighterSparkle4.setValue(0);
      methodSparkle1.setValue(0);
      methodSparkle2.setValue(0);
      methodSparkle3.setValue(0);
      methodSparkle4.setValue(0);

      const animations = [];

      // Add hype animations if hype rating exists
      if (fight.userHypePrediction) {
        animations.push(
          Animated.sequence([
            Animated.timing(predictionScaleAnim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
            Animated.spring(predictionScaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(predictionGlowAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
            Animated.timing(predictionGlowAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
          ]),
          // Flame sparkles
          Animated.timing(flame1, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(flame2, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(flame3, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(flame4, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(flame5, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(flame6, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(flame7, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(flame8, { toValue: 1, duration: 500, useNativeDriver: true })
        );
      }

      // Add fighter sparkles if user predicted a fighter
      if (aggregateStats?.userPrediction?.winner) {
        animations.push(
          Animated.timing(fighterSparkle1, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(fighterSparkle2, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(fighterSparkle3, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(fighterSparkle4, { toValue: 1, duration: 500, useNativeDriver: true })
        );
      }

      // Add method sparkles if user predicted a method
      if (aggregateStats?.userPrediction?.method) {
        animations.push(
          Animated.timing(methodSparkle1, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(methodSparkle2, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(methodSparkle3, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(methodSparkle4, { toValue: 1, duration: 500, useNativeDriver: true })
        );
      }

      if (animations.length > 0) {
        Animated.parallel(animations).start();
      }
    }
  }, [animatePrediction, fight.userHypePrediction, aggregateStats?.userPrediction?.winner, aggregateStats?.userPrediction?.method, predictionScaleAnim, predictionGlowAnim, flame1, flame2, flame3, flame4, flame5, flame6, flame7, flame8, fighterSparkle1, fighterSparkle2, fighterSparkle3, fighterSparkle4, methodSparkle1, methodSparkle2, methodSparkle3, methodSparkle4]);

  // Pulsing glow animation for hot fights (8+ hype) - DISABLED
  // useEffect(() => {
  //   if (predictionStats?.averageHype && predictionStats.averageHype >= 8) {
  //     const pulse = Animated.loop(
  //       Animated.sequence([
  //         Animated.timing(hotFightGlowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
  //         Animated.timing(hotFightGlowAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
  //       ])
  //     );
  //     pulse.start();
  //     return () => {
  //       pulse.stop();
  //       hotFightGlowAnim.setValue(0);
  //     };
  //   }
  // }, [predictionStats?.averageHype, hotFightGlowAnim]);

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

    // Blue ring - user's prediction (inner ring - pushed first)
    if (aggregateStats?.userPrediction?.winner === fighterName) {
      rings.push('user');
    }

    // Community prediction ring - yellow (outer ring - pushed second)
    if (aggregateStats?.communityPrediction?.winner === fighterName) {
      rings.push('community');
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
      <View style={[sharedStyles.container, { backgroundColor: colors.card, position: 'relative', minHeight: 200 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, minHeight: 30 }}>
          {fight.weightClass && (
            <Text style={[sharedStyles.titleLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
              {fight.weightClass.toUpperCase().replace(/_/g, ' ')}{fight.isTitle ? ' TITLE FIGHT' : ''}
            </Text>
          )}
        </View>

          {showEvent && (
            <Text style={[sharedStyles.eventText, { color: colors.textSecondary }]}>
              {fight.event.name} • {formatDate(fight.event.date)}
            </Text>
          )}

          <View style={styles.fighterNamesRow}>
            <Text style={[styles.fighterNameLeft, { color: colors.text }]} numberOfLines={1}>
              {cleanFighterName(getFighterName(fight.fighter1))}
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
              const gap = 2;

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

                    {/* Fighter sparkles - only show if user predicted this fighter */}
                    {aggregateStats?.userPrediction?.winner === fighter1Name && (
                      <>
                        {[fighterSparkle1, fighterSparkle2, fighterSparkle3, fighterSparkle4].map((sparkle, index) => {
                          const positions = [
                            { top: -5, right: -5, tx: 10, ty: -10 },
                            { top: -5, left: -5, tx: -10, ty: -10 },
                            { bottom: -5, right: -5, tx: 10, ty: 10 },
                            { bottom: -5, left: -5, tx: -10, ty: 10 },
                          ];
                          const pos = positions[index] as any;

                          return (
                            <Animated.View
                              key={index}
                              style={[
                                sharedStyles.sparkle,
                                pos,
                                {
                                  opacity: sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
                                  transform: [
                                    { scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                                    { translateX: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.tx] }) },
                                    { translateY: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.ty] }) },
                                  ],
                                },
                              ]}
                            >
                              <FontAwesome name="star" size={12} color="#83B4F3" />
                            </Animated.View>
                          );
                        })}
                      </>
                    )}

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
                </View>
              );
            })()}

            {/* Hype Scores - Centered between fighters */}
            <View style={styles.centeredHypeScores}>
              {/* Community Hype Score */}
              <View style={styles.aggregateScoreContainer}>
                {/* Flame icon changes based on hype level */}
                {(() => {
                  const hypeScore = predictionStats?.averageHype || 0;
                  let flameIcon;

                  if (hypeScore >= 8.5) {
                    // Hot fight (8.5+) - flame with sparkle
                    flameIcon = require('../../assets/flame-sparkle-3.png');
                  } else if (hypeScore >= 7) {
                    // Warm fight (7-8.4) - full flame
                    flameIcon = require('../../assets/flame-full-2.png');
                  } else if (hypeScore > 0) {
                    // Cool fight (<7) - hollow flame
                    flameIcon = require('../../assets/flame-hollow-1.png');
                  } else {
                    // No hype data (0) - grey hollow flame
                    flameIcon = require('../../assets/flame-hollow-grey-0.png');
                  }

                  return (
                    <Image
                      source={flameIcon}
                      style={{ width: 20, height: 20, marginRight: 6 }}
                      resizeMode="contain"
                    />
                  );
                })()}
                <Text style={[sharedStyles.aggregateLabel, { color: predictionStats?.averageHype ? '#fff' : colors.textSecondary }]}>
                  {predictionStats?.averageHype !== undefined
                    ? (predictionStats.averageHype % 1 === 0 ? predictionStats.averageHype.toString() : predictionStats.averageHype.toFixed(1))
                    : '0'
                  }
                </Text>
                {predictionStats?.totalPredictions !== undefined && predictionStats.totalPredictions > 0 && (
                  <Text style={[styles.hypeCountText, { color: colors.textSecondary }]}>
                    ({predictionStats.totalPredictions})
                  </Text>
                )}
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
                          <FontAwesome6 name="fire-flame-curved" size={12} color="#83B4F3" />
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
                    backgroundColor: '#83B4F3',
                    borderRadius: 20,
                    opacity: predictionGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
                    transform: [{ scale: predictionGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
                  }}
                />

                <Animated.View style={{ transform: [{ scale: predictionScaleAnim }] }}>
                  {fight.userHypePrediction && (
                    <View style={sharedStyles.ratingRow}>
                      {/* User hype flame icon changes based on score */}
                      {(() => {
                        const userHype = fight.userHypePrediction;
                        let userFlameIcon;

                        if (userHype >= 9) {
                          // High hype (9-10) - blue flame with sparkle
                          userFlameIcon = require('../../assets/flame-sparkle-blue-7.png');
                        } else if (userHype >= 7) {
                          // Medium hype (7-8) - full blue flame
                          userFlameIcon = require('../../assets/flame-full-blue-6.png');
                        } else {
                          // Low hype (1-6) - hollow blue flame
                          userFlameIcon = require('../../assets/flame-hollow-blue-8.png');
                        }

                        return (
                          <Image
                            source={userFlameIcon}
                            style={{ width: 20, height: 20, marginRight: 6 }}
                            resizeMode="contain"
                          />
                        );
                      })()}
                      <Text style={[sharedStyles.userRatingText, { color: '#83B4F3' }]}>
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
              const gap = 2;

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

                    {/* Fighter sparkles - only show if user predicted this fighter */}
                    {aggregateStats?.userPrediction?.winner === fighter2Name && (
                      <>
                        {[fighterSparkle1, fighterSparkle2, fighterSparkle3, fighterSparkle4].map((sparkle, index) => {
                          const positions = [
                            { top: -5, right: -5, tx: 10, ty: -10 },
                            { top: -5, left: -5, tx: -10, ty: -10 },
                            { bottom: -5, right: -5, tx: 10, ty: 10 },
                            { bottom: -5, left: -5, tx: -10, ty: 10 },
                          ];
                          const pos = positions[index] as any;

                          return (
                            <Animated.View
                              key={index}
                              style={[
                                sharedStyles.sparkle,
                                pos,
                                {
                                  opacity: sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
                                  transform: [
                                    { scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                                    { translateX: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.tx] }) },
                                    { translateY: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.ty] }) },
                                  ],
                                },
                              ]}
                            >
                              <FontAwesome name="star" size={12} color="#83B4F3" />
                            </Animated.View>
                          );
                        })}
                      </>
                    )}

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
                </View>
              );
            })()}
        </View>

        {/* Prediction Methods Section - Positioned below headshots */}
        <View
          key={`predictions-${aggregateStats?.userPrediction?.winner}-${aggregateStats?.communityPrediction?.winner}`}
          style={styles.predictionMethodsContainer}
        >
          {(() => {
            const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
            const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;

            // Fighter 1 predictions (left column) - MUST be boolean for layout logic
            const fighter1UserPrediction = aggregateStats?.userPrediction?.winner === fighter1Name;
            const fighter1CommunityPrediction = aggregateStats?.communityPrediction?.winner === fighter1Name && !!predictionStats;

            // Fighter 2 predictions (right column) - MUST be boolean for layout logic
            const fighter2UserPrediction = aggregateStats?.userPrediction?.winner === fighter2Name;
            const fighter2CommunityPrediction = aggregateStats?.communityPrediction?.winner === fighter2Name && !!predictionStats;

            // Check if predictions are on opposite fighters
            const hasFighter1Prediction = fighter1UserPrediction || fighter1CommunityPrediction;
            const hasFighter2Prediction = fighter2UserPrediction || fighter2CommunityPrediction;
            const areOnOppositeSides = hasFighter1Prediction && hasFighter2Prediction;

            if (areOnOppositeSides) {
              // Predictions on opposite fighters - use 50/50 split
              return (
                <View style={styles.predictionMethodsRow}>
                  {/* Left column - Fighter 1 predictions (always rendered for spacing) */}
                  <View style={styles.predictionMethodColumn}>
                    {/* User prediction method - blue with sparkles */}
                    {fighter1UserPrediction && (
                      <View style={styles.methodTextContainer}>
                        {/* Method sparkles */}
                        {[methodSparkle1, methodSparkle2, methodSparkle3, methodSparkle4].map((sparkle, index) => {
                          const positions = [
                            { top: -3, right: -3, tx: 8, ty: -8 },
                            { top: -3, left: -3, tx: -8, ty: -8 },
                            { bottom: -3, right: -3, tx: 8, ty: 8 },
                            { bottom: -3, left: -3, tx: -8, ty: 8 },
                          ];
                          const pos = positions[index] as any;

                          return (
                            <Animated.View
                              key={index}
                              style={[
                                sharedStyles.sparkle,
                                pos,
                                {
                                  opacity: sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
                                  transform: [
                                    { scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                                    { translateX: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.tx] }) },
                                    { translateY: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.ty] }) },
                                  ],
                                },
                              ]}
                            >
                              <FontAwesome name="star" size={8} color="#83B4F3" />
                            </Animated.View>
                          );
                        })}
                        <Text style={[styles.methodText, { color: '#83B4F3', textAlign: 'left' }]} numberOfLines={3}>
                          My Prediction: {fight.fighter1.lastName}{aggregateStats?.userPrediction?.method ? ` by ${formatMethod(aggregateStats.userPrediction.method)}` : ''}
                        </Text>
                      </View>
                    )}
                    {/* Community prediction method - yellow */}
                    {fighter1CommunityPrediction && (() => {
                      const topMethods = getTopMethods(predictionStats!.fighter1MethodPredictions);
                      if (topMethods.length > 0) {
                        return (
                          <View style={styles.methodTextContainer}>
                            <Text style={[styles.methodText, { color: '#F5C518', textAlign: 'left' }]} numberOfLines={3}>
                              Community Prediction: {fight.fighter1.lastName} by {topMethods.map(m => m.label).join(' or ')}
                            </Text>
                          </View>
                        );
                      }
                      return null;
                    })()}
                  </View>

                  {/* Right column - Fighter 2 predictions (always rendered for spacing) */}
                  <View style={styles.predictionMethodColumn}>
                    {/* User prediction method - blue with sparkles */}
                    {fighter2UserPrediction && (
                      <View style={styles.methodTextContainer}>
                        {/* Method sparkles */}
                        {[methodSparkle1, methodSparkle2, methodSparkle3, methodSparkle4].map((sparkle, index) => {
                          const positions = [
                            { top: -3, right: -3, tx: 8, ty: -8 },
                            { top: -3, left: -3, tx: -8, ty: -8 },
                            { bottom: -3, right: -3, tx: 8, ty: 8 },
                            { bottom: -3, left: -3, tx: -8, ty: 8 },
                          ];
                          const pos = positions[index] as any;

                          return (
                            <Animated.View
                              key={index}
                              style={[
                                sharedStyles.sparkle,
                                pos,
                                {
                                  opacity: sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
                                  transform: [
                                    { scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                                    { translateX: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.tx] }) },
                                    { translateY: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.ty] }) },
                                  ],
                                },
                              ]}
                            >
                              <FontAwesome name="star" size={8} color="#83B4F3" />
                            </Animated.View>
                          );
                        })}
                        <Text style={[styles.methodText, { color: '#83B4F3', textAlign: 'right' }]} numberOfLines={3}>
                          My Prediction: {fight.fighter2.lastName}{aggregateStats?.userPrediction?.method ? ` by ${formatMethod(aggregateStats.userPrediction.method)}` : ''}
                        </Text>
                      </View>
                    )}
                    {/* Community prediction method - yellow */}
                    {fighter2CommunityPrediction && (() => {
                      const topMethods = getTopMethods(predictionStats!.fighter2MethodPredictions);
                      if (topMethods.length > 0) {
                        return (
                          <View style={styles.methodTextContainer}>
                            <Text style={[styles.methodText, { color: '#F5C518', textAlign: 'right' }]} numberOfLines={3}>
                              Community Prediction: {fight.fighter2.lastName} by {topMethods.map(m => m.label).join(' or ')}
                            </Text>
                          </View>
                        );
                      }
                      return null;
                    })()}
                  </View>
                </View>
              );
            } else {
              // Predictions on same fighter - use full width
              return (
                <View style={[
                  styles.predictionMethodsFullWidth,
                  { justifyContent: hasFighter1Prediction ? 'flex-start' : 'flex-end' }
                ]}>
                  {/* Left column - Fighter 1 predictions */}
                  {hasFighter1Prediction && (
                    <View style={styles.predictionMethodColumnFull}>
                      {/* User prediction method - blue with sparkles */}
                      {fighter1UserPrediction && (
                        <View style={styles.methodTextContainer}>
                          {/* Method sparkles */}
                          {[methodSparkle1, methodSparkle2, methodSparkle3, methodSparkle4].map((sparkle, index) => {
                            const positions = [
                              { top: -3, right: -3, tx: 8, ty: -8 },
                              { top: -3, left: -3, tx: -8, ty: -8 },
                              { bottom: -3, right: -3, tx: 8, ty: 8 },
                              { bottom: -3, left: -3, tx: -8, ty: 8 },
                            ];
                            const pos = positions[index] as any;

                            return (
                              <Animated.View
                                key={index}
                                style={[
                                  sharedStyles.sparkle,
                                  pos,
                                  {
                                    opacity: sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
                                    transform: [
                                      { scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                                      { translateX: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.tx] }) },
                                      { translateY: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.ty] }) },
                                    ],
                                  },
                                ]}
                              >
                                <FontAwesome name="star" size={8} color="#83B4F3" />
                              </Animated.View>
                            );
                          })}
                          <Text style={[styles.methodText, { color: '#83B4F3', textAlign: 'left' }]} numberOfLines={3}>
                            My Prediction: {fight.fighter1.lastName}{aggregateStats?.userPrediction?.method ? ` by ${formatMethod(aggregateStats.userPrediction.method)}` : ''}
                          </Text>
                        </View>
                      )}
                      {/* Community prediction method - yellow */}
                      {fighter1CommunityPrediction && (() => {
                        const topMethods = getTopMethods(predictionStats!.fighter1MethodPredictions);
                        if (topMethods.length > 0) {
                          return (
                            <View style={styles.methodTextContainer}>
                              <Text style={[styles.methodText, { color: '#F5C518', textAlign: 'left' }]} numberOfLines={3}>
                                Community Prediction: {fight.fighter1.lastName} by {topMethods.map(m => m.label).join(' or ')}
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  )}

                  {/* Right column - Fighter 2 predictions */}
                  {hasFighter2Prediction && (
                    <View style={styles.predictionMethodColumnFull}>
                      {/* User prediction method - blue with sparkles */}
                      {fighter2UserPrediction && (
                        <View style={styles.methodTextContainer}>
                          {/* Method sparkles */}
                          {[methodSparkle1, methodSparkle2, methodSparkle3, methodSparkle4].map((sparkle, index) => {
                            const positions = [
                              { top: -3, right: -3, tx: 8, ty: -8 },
                              { top: -3, left: -3, tx: -8, ty: -8 },
                              { bottom: -3, right: -3, tx: 8, ty: 8 },
                              { bottom: -3, left: -3, tx: -8, ty: 8 },
                            ];
                            const pos = positions[index] as any;

                            return (
                              <Animated.View
                                key={index}
                                style={[
                                  sharedStyles.sparkle,
                                  pos,
                                  {
                                    opacity: sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
                                    transform: [
                                      { scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                                      { translateX: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.tx] }) },
                                      { translateY: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0, pos.ty] }) },
                                    ],
                                  },
                                ]}
                              >
                                <FontAwesome name="star" size={8} color="#83B4F3" />
                              </Animated.View>
                            );
                          })}
                          <Text style={[styles.methodText, { color: '#83B4F3', textAlign: 'right' }]} numberOfLines={3}>
                            My Prediction: {fight.fighter2.lastName}{aggregateStats?.userPrediction?.method ? ` by ${formatMethod(aggregateStats.userPrediction.method)}` : ''}
                          </Text>
                        </View>
                      )}
                      {/* Community prediction method - yellow */}
                      {fighter2CommunityPrediction && (() => {
                        const topMethods = getTopMethods(predictionStats!.fighter2MethodPredictions);
                        if (topMethods.length > 0) {
                          return (
                            <View style={styles.methodTextContainer}>
                              <Text style={[styles.methodText, { color: '#F5C518', textAlign: 'right' }]} numberOfLines={3}>
                                Community Prediction: {fight.fighter2.lastName} by {topMethods.map(m => m.label).join(' or ')}
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  )}
                </View>
              );
            }
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
    marginBottom: 8,
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
  predictionMethodsContainer: {
    marginBottom: 12,
    paddingHorizontal: 0,
  },
  predictionMethodsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  predictionMethodsFullWidth: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  predictionMethodColumn: {
    flex: 1,
    gap: 2,
  },
  predictionMethodColumnFull: {
    gap: 2,
    width: '100%',
  },
  methodTextContainer: {
    position: 'relative',
    paddingHorizontal: 4,
  },
  methodText: {
    fontSize: 10,
    fontWeight: '500',
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
  hypeCountText: {
    fontSize: 10,
    fontWeight: '400',
    marginLeft: 6,
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
    top: 6,
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
    gap: 8,
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
