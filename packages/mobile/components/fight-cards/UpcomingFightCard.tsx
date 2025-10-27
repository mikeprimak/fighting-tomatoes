import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions, Alert } from 'react-native';
import { FontAwesome, FontAwesome6, Entypo } from '@expo/vector-icons';
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
    if (method === 'DECISION') return 'DEC';
    if (method === 'SUBMISSION') return 'SUB';
    return method;
  };

  // Heatmap function - returns border color based on hype score (0-10)
  // Fine gradient: ≤7 grey, 7-8.4 orange (#eb8600), 8.5+ red
  const getHypeBackgroundColor = (hypeScore: number) => {
    const isDark = colorScheme === 'dark';

    // Unremarkable tier (≤7.0)
    if (hypeScore < 7.0) {
      return colors.card; // Default grey
    }

    // 7.0-8.4: Orange gradient (#eb8600 = rgb(235, 134, 0))
    if (hypeScore < 8.5) {
      const range = hypeScore - 7.0; // 0.0 to 1.4
      const baseOpacity = isDark ? 0.25 : 0.18;
      const maxOpacity = isDark ? 0.85 : 0.75;
      const opacity = baseOpacity + (range / 1.5) * (maxOpacity - baseOpacity);
      return `rgba(235, 134, 0, ${opacity.toFixed(2)})`; // Orange
    }

    // 8.5+: Red gradient (rgb(255, 0, 0))
    if (hypeScore < 9.0) {
      // 8.5-8.9: Bright red
      const range = hypeScore - 8.5; // 0.0 to 0.4
      const baseOpacity = isDark ? 0.75 : 0.65;
      const maxOpacity = isDark ? 0.85 : 0.75;
      const opacity = baseOpacity + (range / 0.5) * (maxOpacity - baseOpacity);
      return `rgba(255, 0, 0, ${opacity.toFixed(2)})`;
    } else if (hypeScore < 9.5) {
      // 9.0-9.4: Very bright red
      const range = hypeScore - 9.0; // 0.0 to 0.4
      const baseOpacity = isDark ? 0.85 : 0.75;
      const maxOpacity = isDark ? 0.92 : 0.85;
      const opacity = baseOpacity + (range / 0.5) * (maxOpacity - baseOpacity);
      return `rgba(255, 0, 0, ${opacity.toFixed(2)})`;
    } else {
      // 9.5-10.0: Pure red
      return isDark ? '#ff0000' : 'rgba(255, 0, 0, 0.90)';
    }
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
          'DECISION': 'DEC',
          'KO_TKO': 'KO',
          'SUBMISSION': 'SUB',
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

  const hypeBorderColor = getHypeBackgroundColor(predictionStats?.averageHype || 0);
  const grayColor = colors.border || '#888888';

  // Create a 50% opacity version of the hype color for the fade-in start
  const getHalfOpacityColor = (color: string) => {
    // If it's already an rgba color, halve the alpha
    const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
      const [, r, g, b, a] = rgbaMatch;
      const alpha = a ? parseFloat(a) * 0.5 : 0.5;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    // If it's a hex color, convert to rgba with 0.5 opacity
    const hexMatch = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (hexMatch) {
      const [, r, g, b] = hexMatch;
      return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, 0.5)`;
    }
    // Fallback to the original color
    return color;
  };

  const halfHypeColor = getHalfOpacityColor(hypeBorderColor);

  return (
    <TouchableOpacity onPress={() => onPress(fight)} activeOpacity={0.7}>
      <View style={[sharedStyles.container, {
        position: 'relative',
        overflow: 'hidden'
      }]}>
          {showEvent && (
            <Text style={[sharedStyles.eventText, { color: colors.textSecondary }]}>
              {fight.event.name} • {formatDate(fight.event.date)}
            </Text>
          )}

          <View style={styles.fighterNamesRow}>
            {/* Hype Scores on far left */}
            <View style={styles.hypeScoresInline}>
              {/* Community Hype Score */}
              <View style={styles.aggregateScoreContainer}>
                {(() => {
                  const hypeScore = predictionStats?.averageHype || 0;
                  let flameIcon;

                  if (hypeScore >= 8.5) {
                    flameIcon = require('../../assets/flame-sparkle-3.png');
                  } else if (hypeScore >= 7) {
                    flameIcon = require('../../assets/flame-full-2.png');
                  } else if (hypeScore > 0) {
                    flameIcon = require('../../assets/flame-hollow-1.png');
                  } else {
                    flameIcon = require('../../assets/flame-hollow-grey-0.png');
                  }

                  return (
                    <Image
                      source={flameIcon}
                      style={{ width: 18, height: 18, marginRight: 4 }}
                      resizeMode="contain"
                    />
                  );
                })()}
                <Text style={[sharedStyles.aggregateLabel, { color: predictionStats?.averageHype ? '#fff' : colors.textSecondary, fontSize: 13 }]}>
                  {predictionStats?.averageHype !== undefined
                    ? (predictionStats.averageHype % 1 === 0 ? predictionStats.averageHype.toString() : predictionStats.averageHype.toFixed(1))
                    : '0'
                  }
                </Text>
              </View>

              {/* User's Personal Hype Score */}
              {fight.userHypePrediction && (
                <View style={styles.userHypeInline}>
                  {/* Flame sparkles */}
                  {[flame1, flame2, flame3, flame4].map((flame, index) => {
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
                            opacity: flame.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
                            transform: [
                              { scale: flame.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                              { translateX: flame.interpolate({ inputRange: [0, 1], outputRange: [0, pos.tx] }) },
                              { translateY: flame.interpolate({ inputRange: [0, 1], outputRange: [0, pos.ty] }) },
                            ],
                          },
                        ]}
                      >
                        <FontAwesome6 name="fire-flame-curved" size={8} color="#83B4F3" />
                      </Animated.View>
                    );
                  })}

                  {/* Glow effect */}
                  <Animated.View
                    style={{
                      position: 'absolute',
                      top: -2,
                      left: -2,
                      right: -2,
                      bottom: -2,
                      backgroundColor: '#83B4F3',
                      borderRadius: 12,
                      opacity: predictionGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
                      transform: [{ scale: predictionGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
                    }}
                  />

                  <Animated.View style={{ transform: [{ scale: predictionScaleAnim }], flexDirection: 'row', alignItems: 'center' }}>
                    {(() => {
                      const userHype = fight.userHypePrediction;
                      let userFlameIcon;

                      if (userHype >= 9) {
                        userFlameIcon = require('../../assets/flame-sparkle-blue-7.png');
                      } else if (userHype >= 7) {
                        userFlameIcon = require('../../assets/flame-full-blue-6.png');
                      } else {
                        userFlameIcon = require('../../assets/flame-hollow-blue-8.png');
                      }

                      return (
                        <Image
                          source={userFlameIcon}
                          style={{ width: 18, height: 18, marginRight: 4 }}
                          resizeMode="contain"
                        />
                      );
                    })()}
                    <Text style={[sharedStyles.userRatingText, { color: '#83B4F3', fontSize: 13 }]}>
                      {fight.userHypePrediction}
                    </Text>
                  </Animated.View>
                </View>
              )}
            </View>

            {/* Fighter names together with "vs" */}
            <View style={styles.fighterNamesVs}>
              {/* Fighter 1 with method badges above */}
              <View style={styles.fighterWithBadge}>
                {/* Badges - absolutely positioned above */}
                {false && (() => {
                  const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
                  const fighter1UserPrediction = aggregateStats?.userPrediction?.winner === fighter1Name;
                  const fighter1CommunityPrediction = aggregateStats?.communityPrediction?.winner === fighter1Name && !!predictionStats;

                  return (
                    <View style={styles.badgesAbsolute}>
                      {/* User prediction badge - blue with sparkles */}
                      {fighter1UserPrediction && aggregateStats?.userPrediction?.method && (
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
                          <View style={styles.methodBadge}>
                            <Text style={styles.methodBadgeText}>
                              {formatMethod(aggregateStats.userPrediction.method)}
                            </Text>
                          </View>
                        </View>
                      )}
                      {/* Community prediction badge - yellow */}
                      {fighter1CommunityPrediction && (() => {
                        const topMethods = getTopMethods(predictionStats!.fighter1MethodPredictions);
                        if (topMethods.length > 0) {
                          return (
                            <View style={[styles.methodBadge, { backgroundColor: '#F5C518' }]}>
                              <Text style={[styles.methodBadgeText, { color: '#000' }]}>
                                {topMethods.map(m => m.label).join('/')}
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  );
                })()}
                <Text style={[styles.fighterName, { color: colors.text }]} numberOfLines={1}>
                  {cleanFighterName(getFighterName(fight.fighter1))}
                </Text>
              </View>

              <Text style={[styles.vsText, { color: colors.textSecondary }]}>vs</Text>

              {/* Fighter 2 with method badges above */}
              <View style={styles.fighterWithBadge}>
                {/* Badges - absolutely positioned above */}
                {false && (() => {
                  const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
                  const fighter2UserPrediction = aggregateStats?.userPrediction?.winner === fighter2Name;
                  const fighter2CommunityPrediction = aggregateStats?.communityPrediction?.winner === fighter2Name && !!predictionStats;

                  return (
                    <View style={styles.badgesAbsolute}>
                      {/* User prediction badge - blue with sparkles */}
                      {fighter2UserPrediction && aggregateStats?.userPrediction?.method && (
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
                          <View style={styles.methodBadge}>
                            <Text style={styles.methodBadgeText}>
                              {formatMethod(aggregateStats.userPrediction.method)}
                            </Text>
                          </View>
                        </View>
                      )}
                      {/* Community prediction badge - yellow */}
                      {fighter2CommunityPrediction && (() => {
                        const topMethods = getTopMethods(predictionStats!.fighter2MethodPredictions);
                        if (topMethods.length > 0) {
                          return (
                            <View style={[styles.methodBadge, { backgroundColor: '#F5C518' }]}>
                              <Text style={[styles.methodBadgeText, { color: '#000' }]}>
                                {topMethods.map(m => m.label).join('/')}
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  );
                })()}
                <Text style={[styles.fighterName, { color: colors.text }]} numberOfLines={1}>
                  {cleanFighterName(getFighterName(fight.fighter2))}
                </Text>
              </View>
            </View>
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

        {/* Gradient hype underline - fades in from 50% (0-10%), pure color (10-20%), fades out (20-40%) */}
        <LinearGradient
          colors={[halfHypeColor, hypeBorderColor, hypeBorderColor, grayColor, grayColor]}
          locations={[0, 0.10, 0.20, 0.40, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
          }}
        />
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
  methodTextContainer: {
    position: 'relative',
    paddingHorizontal: 4,
  },
  centeredHypeScores: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginBottom: 12,
  },
  hypeScoresInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aggregateScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  userHypeInline: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
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
    right: 8,
    padding: 4,
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '100%',
    marginBottom: 4,
    gap: 12,
  },
  fighterNamesVs: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  fighterWithBadge: {
    position: 'relative',
    flexShrink: 1,
    maxWidth: '45%',
    overflow: 'visible',
  },
  badgesAbsolute: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'nowrap',
    marginBottom: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  fighterName: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  vsText: {
    fontSize: 13,
    fontWeight: '400',
  },
  fighterNameLeft: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'left',
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
  methodBadge: {
    backgroundColor: '#83B4F3',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: 'flex-start',
  },
  methodBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
