import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { router } from 'expo-router';
import { useAuth } from '../../store/AuthContext';
import { BaseFightCardProps } from './shared/types';
import { getFighterImage, getFighterName, cleanFighterName, formatDate, getLastName, formatMethod } from './shared/utils';
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
    toastTranslateY.setValue(50);

    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: 50, duration: 300, useNativeDriver: true }),
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
        showToast('You will be notified right before this fight!');
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
          'KO_TKO': 'KO/TKO',
          'SUBMISSION': 'Submission',
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
    <TouchableOpacity onPress={() => router.push(`/fight/${fight.id}`)} activeOpacity={0.7}>
      <View style={[sharedStyles.container, { backgroundColor: colors.card }]}>
        {fight.isTitle && (
          <Text style={[sharedStyles.titleLabel, { color: colors.tint }]}>
            TITLE FIGHT
          </Text>
        )}

        {showEvent && (
          <Text style={[sharedStyles.eventText, { color: colors.textSecondary }]}>
            {fight.event.name} • {formatDate(fight.event.date)}
          </Text>
        )}

        <Text style={[sharedStyles.matchup, { color: colors.text }]}>
          {cleanFighterName(getFighterName(fight.fighter1))} vs {cleanFighterName(getFighterName(fight.fighter2))}
        </Text>

        <View style={sharedStyles.horizontalInfoRow}>
          {/* Fighter Headshots with Rings */}
          <View style={sharedStyles.headshotsContainer}>
            {/* Fighter 1 with rings */}
            {(() => {
              const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
              const fighter1Rings = getFighterRings(fight.fighter1.id, fighter1Name, false);
              const baseSize = 75;
              const borderWidth = 3;
              const gap = 1;

              return (
                <View style={sharedStyles.fighterHeadshotWrapper}>
                  {fighter1Rings.map((ring, index) => {
                    const ringColor = ring === 'community' ? '#F5C518' : ring === 'community-gold' ? '#8A7014' : '#83B4F3';
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
              );
            })()}

            {/* Fighter 2 with rings */}
            {(() => {
              const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
              const fighter2Rings = getFighterRings(fight.fighter2.id, fighter2Name, true);
              const baseSize = 75;
              const borderWidth = 3;
              const gap = 1;

              return (
                <View style={sharedStyles.fighterHeadshotWrapper}>
                  {fighter2Rings.map((ring, index) => {
                    const ringColor = ring === 'community' ? '#F5C518' : ring === 'community-gold' ? '#8A7014' : '#83B4F3';
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
              );
            })()}
          </View>

          {/* Ratings Wrapper */}
          <View style={sharedStyles.ratingsWrapper}>
            {/* Community Hype Score */}
            <View style={styles.aggregateScoreContainer}>
              <FontAwesome6
                name="fire-flame-curved"
                size={20}
                color="#FF6B35"
                style={sharedStyles.ratingIcon}
              />
              <Text style={[sharedStyles.aggregateLabel, { color: '#fff' }]}>
                {predictionStats?.averageHype !== undefined
                  ? (predictionStats.averageHype % 1 === 0 ? predictionStats.averageHype.toString() : predictionStats.averageHype.toFixed(1))
                  : '0'
                }
              </Text>
            </View>

            {/* User's Personal Prediction */}
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onPress(fight);
              }}
              onPressIn={() => setIsPredictionPressed(true)}
              onPressOut={() => setIsPredictionPressed(false)}
              activeOpacity={1}
              style={styles.predictionButton}
            >
              <View style={[
                styles.predictionContainer,
                { backgroundColor: isPredictionPressed ? 'rgba(131, 180, 243, 0.15)' : 'transparent' }
              ]}>
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
                  <View style={sharedStyles.ratingRow}>
                    <FontAwesome6
                      name="fire-flame-curved"
                      size={20}
                      color="#83B4F3"
                      style={sharedStyles.ratingIcon}
                    />
                    <Text style={[sharedStyles.userRatingText, { color: '#83B4F3', fontSize: fight.userHypePrediction ? 28 : 12 }]}>
                      {fight.userHypePrediction ? `${fight.userHypePrediction}` : 'Predict'}
                    </Text>
                  </View>
                </Animated.View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Prediction Details */}
        <View style={sharedStyles.outcomeContainer}>
          {/* My Prediction */}
          {aggregateStats?.userPrediction ? (
            <View style={sharedStyles.outcomeLineRow}>
              <View style={sharedStyles.iconContainer}>
                <FontAwesome name="eye" size={12} color="#83B4F3" />
              </View>
              <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                My Prediction:
              </Text>
              <Text style={[sharedStyles.outcomeLineText, { flex: 1 }]} numberOfLines={1}>
                <Text style={{ color: colors.text }}>
                  {getLastName(aggregateStats.userPrediction.winner) || 'N/A'}
                </Text>
                {aggregateStats.userPrediction.method && (
                  <Text style={{ color: colors.textSecondary }}>
                    {' by '}{formatMethod(aggregateStats.userPrediction.method)}
                  </Text>
                )}
              </Text>
            </View>
          ) : (
            <View style={sharedStyles.outcomeLineRow}>
              <View style={sharedStyles.iconContainer}>
                <FontAwesome name="eye" size={12} color="#83B4F3" />
              </View>
              <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                My Prediction:
              </Text>
              <Text style={[sharedStyles.outcomeLineText, { color: colors.textSecondary }]}>
                N/A
              </Text>
            </View>
          )}

          {/* Community Prediction */}
          {aggregateStats?.communityPrediction?.fighter1Name && aggregateStats?.communityPrediction?.fighter2Name ? (
            <>
              <View style={sharedStyles.outcomeLineRow}>
                <View style={sharedStyles.iconContainer}>
                  <FontAwesome name="bar-chart" size={12} color="#F5C518" />
                </View>
                <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                  Community Predictions
                </Text>
              </View>

              {/* Horizontal Prediction Bar */}
              <View style={styles.predictionBarContainer}>
                {/* Fighter names above bar */}
                <View style={styles.fighterNamesRow}>
                  <Text style={[styles.fighterNameLeft, { color: colors.text }]} numberOfLines={1}>
                    {getLastName(aggregateStats.communityPrediction.fighter1Name)}
                  </Text>
                  <Text style={[styles.fighterNameRight, { color: colors.text }]} numberOfLines={1}>
                    {getLastName(aggregateStats.communityPrediction.fighter2Name)}
                  </Text>
                </View>

                {/* Single split bar */}
                <View style={styles.splitBar}>
                  {aggregateStats.communityPrediction.fighter1Percentage > 0 && (
                    <View
                      style={[
                        styles.splitBarLeft,
                        {
                          width: aggregateStats.communityPrediction.fighter2Percentage === 0 ? '100%' : `${aggregateStats.communityPrediction.fighter1Percentage}%`,
                          backgroundColor: '#F5C518'
                        }
                      ]}
                    >
                      <Text style={styles.splitBarPercentage}>
                        {aggregateStats.communityPrediction.fighter2Percentage === 0 ? '100' : aggregateStats.communityPrediction.fighter1Percentage}%
                        {aggregateStats.communityPrediction.fighter1Percentage > 75 && ` ${getLastName(aggregateStats.communityPrediction.fighter1Name)}`}
                      </Text>
                    </View>
                  )}
                  {aggregateStats.communityPrediction.fighter2Percentage > 0 && (
                    <View
                      style={[
                        styles.splitBarRight,
                        {
                          width: aggregateStats.communityPrediction.fighter1Percentage === 0 ? '100%' : `${aggregateStats.communityPrediction.fighter2Percentage}%`,
                          backgroundColor: '#8A7014',
                        }
                      ]}
                    >
                      <Text style={[styles.splitBarPercentage, { color: '#fff' }]}>
                        {aggregateStats.communityPrediction.fighter1Percentage === 0 ? '100' : aggregateStats.communityPrediction.fighter2Percentage}%
                        {aggregateStats.communityPrediction.fighter2Percentage > 75 && ` ${getLastName(aggregateStats.communityPrediction.fighter2Name)}`}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Per-Fighter Method Predictions Row */}
                {predictionStats && (
                  <View style={styles.predictionTextRow}>
                    {/* Fighter 1 Method Prediction (Left) */}
                    {(() => {
                      const fighter1Methods = getTopMethods(predictionStats.fighter1MethodPredictions);

                      if (fighter1Methods.length > 0) {
                        return (
                          <Text style={[styles.predictionTextLeft, { color: '#F5C518' }]}>
                            {fighter1Methods.map(m => m.label).join(' or ')}
                          </Text>
                        );
                      }
                      return null;
                    })()}

                    {/* Fighter 2 Method Prediction (Right) */}
                    {(() => {
                      const fighter2Methods = getTopMethods(predictionStats.fighter2MethodPredictions);

                      if (fighter2Methods.length > 0) {
                        return (
                          <Text style={[styles.predictionTextRight, { color: '#8A7014' }]}>
                            {fighter2Methods.map(m => m.label).join(' or ')}
                          </Text>
                        );
                      }
                      return null;
                    })()}
                  </View>
                )}
              </View>
            </>
          ) : (
            <View style={sharedStyles.outcomeLineRow}>
              <View style={sharedStyles.iconContainer}>
                <FontAwesome name="bar-chart" size={12} color="#F5C518" />
              </View>
              <Text style={[sharedStyles.outcomeLabel, { color: colors.textSecondary }]}>
                Community Prediction:
              </Text>
              <Text style={[sharedStyles.outcomeLineText, { color: colors.textSecondary }]}>
                N/A
              </Text>
            </View>
          )}
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

        {/* Bell icon */}
        {isAuthenticated && (
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
                color={fight.isFollowing ? '#ef4444' : colors.textSecondary}
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
          >
            <FontAwesome name="bell" size={16} color="#1a1a1a" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  aggregateScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 75,
  },
  predictionButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  predictionContainer: {
    position: 'relative',
    paddingVertical: 8,
    paddingLeft: 4,
    paddingRight: 15,
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
  toastContainer: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
  },
  toastText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  predictionBarContainer: {
    marginTop: 0,
    gap: 4,
  },
  fighterNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  fighterNameLeft: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
  },
  fighterNameRight: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  splitBar: {
    flexDirection: 'row',
    height: 24,
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
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000',
  },
  predictionTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 3,
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
