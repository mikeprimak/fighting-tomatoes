import React, { useEffect, useRef, useState, useMemo, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions, Alert, Easing } from 'react-native';
import { FontAwesome, FontAwesome6, Entypo } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { router } from 'expo-router';
import { useAuth } from '../../store/AuthContext';
import { usePredictionAnimation } from '../../store/PredictionAnimationContext';
import { BaseFightCardProps } from './shared/types';
import { getFighterImage, getFighterName, cleanFighterName, formatDate, getLastName } from './shared/utils';
import { sharedStyles } from './shared/styles';
import { LinearGradient } from 'expo-linear-gradient';
import { getHypeHeatmapColor } from '../../utils/heatmap';

interface LiveFightCardProps extends BaseFightCardProps {
  animateRating?: boolean;
  isNextFight?: boolean;
  lastCompletedFightTime?: string;
}

// Status types for the live fight card
type LiveFightStatus = 'up_next' | 'starting_soon' | 'live_now';

function LiveFightCard({
  fight,
  onPress,
  showEvent = true,
  animateRating = false,
  isNextFight = false,
  lastCompletedFightTime,
}: LiveFightCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { pendingRatingAnimationFightId, setPendingRatingAnimation, lastViewedFightId, setLastViewedFight } = usePredictionAnimation();

  // Animation ref for rating animation
  const ratingScaleAnim = useRef(new Animated.Value(1)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;

  // Local formatMethod function for this component - shows "KO" instead of "KO/TKO"
  const formatMethod = (method: string | null | undefined) => {
    if (!method) return '';
    if (method === 'KO_TKO') return 'KO';
    if (method === 'DECISION') return 'DEC';
    if (method === 'SUBMISSION') return 'SUB';
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

  // Animation for "Starting soon..." text pulse
  const startingSoonPulseAnim = useRef(new Animated.Value(1)).current;

  // Determine the current status of the live fight card
  const getLiveStatus = (): LiveFightStatus => {
    // If fight has actually started, show "Live Now"
    if (fight.hasStarted && !fight.isComplete) {
      return 'live_now';
    }

    // If this is the next fight (waiting to start)
    if (isNextFight && !fight.hasStarted) {
      if (lastCompletedFightTime) {
        // Use the actual lastCompletedFightTime to calculate minutes elapsed
        const lastCompletedDate = new Date(lastCompletedFightTime).getTime();
        const minutesSinceLastFight = (Date.now() - lastCompletedDate) / 1000 / 60;
        // After 5 minutes, switch to "Starting soon..."
        if (minutesSinceLastFight >= 5) {
          return 'starting_soon';
        }
      }
      return 'up_next';
    }

    // Default to live_now for backwards compatibility
    return 'live_now';
  };

  const liveStatus = getLiveStatus();

  // Force re-render periodically to update "Up Next" / "Starting Soon" status
  // 30 second interval is sufficient since status only changes after ~5 minutes
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (isNextFight && !fight.hasStarted) {
      const interval = setInterval(forceUpdate, 30000); // 30 seconds instead of 1 second
      return () => clearInterval(interval);
    }
  }, [isNextFight, fight.hasStarted]);

  // Pulsing animation for "Starting soon..."
  useEffect(() => {
    if (liveStatus === 'starting_soon') {
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
  }, [liveStatus, startingSoonPulseAnim]);

  // Track previous hype value to detect when data updates
  const prevHypeRef = useRef(fight.userHypePrediction);
  const isWaitingForDataUpdate = useRef(false);

  // When lastViewedFightId matches, start waiting for data update
  useEffect(() => {
    if (lastViewedFightId === fight.id) {
      isWaitingForDataUpdate.current = true;
    }
  }, [lastViewedFightId, fight.id]);

  // Highlight animation - triggers when data updates after returning from fight detail screen
  useEffect(() => {
    const prevHype = prevHypeRef.current;
    const currentHype = fight.userHypePrediction;

    // Update the ref for next comparison
    prevHypeRef.current = currentHype;

    // If we're waiting for data update and the hype value changed, trigger animation
    if (isWaitingForDataUpdate.current && prevHype !== currentHype) {
      isWaitingForDataUpdate.current = false;

      // Small delay to let the UI render the new value first
      const timer = setTimeout(() => {
        // Animate: fade in, hold, then fade out
        highlightAnim.setValue(0);
        Animated.sequence([
          // Fade in
          Animated.timing(highlightAnim, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
          }),
          // Hold at full brightness
          Animated.delay(300),
          // Fade out
          Animated.timing(highlightAnim, {
            toValue: 0,
            duration: 800,
            easing: Easing.in(Easing.ease),
            useNativeDriver: false,
          }),
        ]).start(() => {
          // Clear the lastViewedFightId after animation completes
          setLastViewedFight(null);
        });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [fight.userHypePrediction, highlightAnim, setLastViewedFight]);

  // Get the strip text and color based on status
  const getStripConfig = () => {
    switch (liveStatus) {
      case 'up_next':
        return { text: 'Up Next', bgColor: '#F5C518', textColor: '#000000' };
      case 'starting_soon':
        return { text: 'Starting Soon', bgColor: '#FF8C00', textColor: '#FFFFFF' };
      case 'live_now':
      default:
        return { text: 'Live Now', bgColor: '#FF0000', textColor: '#FFFFFF' };
    }
  };

  const stripConfig = getStripConfig();

  // Use fight object data directly - no need for separate API calls
  const predictionStats = useMemo(() => ({
    averageHype: fight.averageHype || 0,
    totalPredictions: 0,
  }), [fight.averageHype]);

  // Derive user's predicted winner name from fight.userPredictedWinner (fighter ID)
  const aggregateStats = useMemo(() => {
    // Check if user has predicted a winner (userPredictedWinner is a fighter ID)
    let winnerName: string | null = null;
    if ((fight as any).userPredictedWinner) {
      if ((fight as any).userPredictedWinner === fight.fighter1.id) {
        winnerName = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
      } else if ((fight as any).userPredictedWinner === fight.fighter2.id) {
        winnerName = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
      }
    }

    return {
      userPrediction: (fight.userHypePrediction || winnerName) ? {
        winner: winnerName,
        method: (fight as any).userPredictedMethod || null,
      } : null,
      communityPrediction: null,
    };
  }, [fight.userHypePrediction, (fight as any).userPredictedWinner, fight.fighter1.id, fight.fighter2.id, fight.fighter1.firstName, fight.fighter1.lastName, fight.fighter2.firstName, fight.fighter2.lastName]);

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

  // Reset image errors
  useEffect(() => {
    setFighter1ImageError(false);
    setFighter2ImageError(false);
  }, [fight.id]);

  // Rating animation - triggers when navigating back to list screen after rating fight
  useEffect(() => {
    // Only animate if this is the fight that needs animation
    if (pendingRatingAnimationFightId !== fight.id) {
      return;
    }

    // Start animation after 450ms delay
    const timer = setTimeout(() => {
      // Animate rating square: scale up and down twice
      Animated.sequence([
        Animated.timing(ratingScaleAnim, {
          toValue: 1.15,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(ratingScaleAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(ratingScaleAnim, {
          toValue: 1.15,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(ratingScaleAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Clear the pending animation flag after animation completes
        setPendingRatingAnimation(null);
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [pendingRatingAnimationFightId, fight.id, ratingScaleAnim, setPendingRatingAnimation]);

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

  // Memoize expensive color calculations to avoid recalculation on every render
  const hypeBorderColor = useMemo(
    () => getHypeHeatmapColor(predictionStats?.averageHype || 0),
    [predictionStats?.averageHype]
  );
  const ratingBorderColor = useMemo(
    () => getHypeHeatmapColor(fight.averageRating || 0),
    [fight.averageRating]
  );
  const grayColor = colors.border || '#888888';

  const userHypeColor = useMemo(
    () => getHypeHeatmapColor(fight.userHypePrediction || 0),
    [fight.userHypePrediction]
  );

  // Interpolate highlight color for animation
  const highlightBackgroundColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', 'rgba(245, 197, 24, 0.3)'], // Yellow with 30% opacity
  });

  return (
    <TouchableOpacity onPress={() => router.push(`/fight/${fight.id}`)} activeOpacity={0.7}>
      <Animated.View style={[sharedStyles.container, {
        position: 'relative',
        overflow: 'hidden',
        paddingVertical: 0,
        paddingHorizontal: 0,
        backgroundColor: highlightBackgroundColor,
      }]}>
          {/* Status Strip at Top - Up Next / Starting Soon / Live Now */}
          <Animated.View style={[
            styles.liveNowStrip,
            { backgroundColor: stripConfig.bgColor },
            liveStatus === 'starting_soon' && { opacity: startingSoonPulseAnim }
          ]}>
            <Text style={[styles.liveNowStripText, { color: stripConfig.textColor }]}>
              {stripConfig.text}
            </Text>
          </Animated.View>

          {/* Content area below the strip - matches UpcomingFightCard layout */}
          {/* Background is a subtle mix of yellow and the current bg to highlight this is the next fight */}
          <View style={{
            position: 'relative',
            paddingLeft: 64,
            paddingRight: 64,
            paddingVertical: 6,
            minHeight: 62,
            justifyContent: 'center',
            backgroundColor: colorScheme === 'dark'
              ? 'rgba(245, 197, 24, 0.08)' // 8% yellow on dark background
              : 'rgba(245, 197, 24, 0.12)', // 12% yellow on light background
          }}>
            {/* Full-height community hype square on the left */}
            <View style={[
              styles.hypeSquare,
              {
                backgroundColor: (predictionStats?.averageHype !== undefined && predictionStats.averageHype > 0)
                  ? hypeBorderColor
                  : 'transparent',
                borderWidth: (predictionStats?.averageHype !== undefined && predictionStats.averageHype > 0)
                  ? 0
                  : 1,
                borderColor: colors.textSecondary,
              }
            ]}>
              {(predictionStats?.averageHype !== undefined && predictionStats.averageHype > 0) ? (
                <>
                  <FontAwesome6
                    name="fire-flame-curved"
                    size={14}
                    color="rgba(0,0,0,0.45)"
                  />
                  <Text style={styles.hypeSquareNumber}>
                    {predictionStats.averageHype.toFixed(1)}
                  </Text>
                </>
              ) : (
                <FontAwesome6
                  name="fire-flame-curved"
                  size={16}
                  color={colors.textSecondary}
                  style={{ opacity: 0.5 }}
                />
              )}
            </View>

            {/* Full-height user hype square on the right */}
            <View style={[
              styles.userHypeSquare,
              {
                backgroundColor: (fight.userHypePrediction !== undefined && fight.userHypePrediction !== null && fight.userHypePrediction > 0)
                  ? userHypeColor
                  : 'transparent',
                borderWidth: (fight.userHypePrediction !== undefined && fight.userHypePrediction !== null && fight.userHypePrediction > 0)
                  ? 0
                  : 1,
                borderColor: colors.textSecondary,
              }
            ]}>
              {(fight.userHypePrediction !== undefined && fight.userHypePrediction !== null && fight.userHypePrediction > 0) ? (
                <>
                  <FontAwesome6
                    name="fire-flame-curved"
                    size={14}
                    color="rgba(0,0,0,0.45)"
                  />
                  <Text style={styles.hypeSquareNumber}>
                    {Math.round(fight.userHypePrediction).toString()}
                  </Text>
                </>
              ) : (
                <FontAwesome6
                  name="fire-flame-curved"
                  size={16}
                  color={colors.textSecondary}
                  style={{ opacity: 0.5 }}
                />
              )}
            </View>

            <View style={[styles.fighterNamesRow, { marginBottom: 0, marginTop: 0 }]}>
            {/* Fighter names with headshots */}
            <View style={styles.fighterNamesContainer}>
              {/* Fighter 1 - Left half */}
              <View style={[styles.fighter1Container, { flexDirection: 'row', alignItems: 'center', overflow: 'visible' }]}>
                <View style={[
                  { alignSelf: 'center', position: 'relative', flex: 1, zIndex: 2, alignItems: 'flex-end' }
                ]}>
                  {/* First name */}
                  <Text
                    style={[styles.fighterName, { textAlign: 'right', fontWeight: '400', color: colors.textSecondary, paddingHorizontal: 4, flexShrink: 0 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fight.fighter1.firstName}
                  </Text>
                  {/* Last name */}
                  <Text
                    style={[styles.fighterLastName, { textAlign: 'right', color: colors.text, paddingHorizontal: 4, flexShrink: 0 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fight.fighter1.lastName}
                  </Text>
                </View>
                {/* Fighter 1 headshot - right of name */}
                <View style={[styles.fighterImageWrapper, { marginLeft: 6, marginRight: -3 }]}>
                  <Image
                    source={getFighter1ImageSource()}
                    style={styles.fighterHeadshot}
                    onError={() => setFighter1ImageError(true)}
                  />
                  {/* User prediction indicator - yellow circle with user icon (bottom-left for fighter 1) */}
                  {aggregateStats?.userPrediction?.winner === `${fight.fighter1.firstName} ${fight.fighter1.lastName}` && (
                    <View style={styles.userPredictionIndicatorLeft}>
                      <FontAwesome name="user" size={14} color="#000000" />
                    </View>
                  )}
                </View>
              </View>

              {/* Fighter 2 - Right half */}
              <View style={[styles.fighter2Container, { flexDirection: 'row', alignItems: 'center', overflow: 'visible' }]}>
                {/* Fighter 2 headshot - left of name */}
                <View style={[styles.fighterImageWrapper, { marginRight: 6, marginLeft: -3 }]}>
                  <Image
                    source={getFighter2ImageSource()}
                    style={styles.fighterHeadshot}
                    onError={() => setFighter2ImageError(true)}
                  />
                  {/* User prediction indicator - yellow circle with user icon (bottom-right for fighter 2) */}
                  {aggregateStats?.userPrediction?.winner === `${fight.fighter2.firstName} ${fight.fighter2.lastName}` && (
                    <View style={styles.userPredictionIndicatorRight}>
                      <FontAwesome name="user" size={14} color="#000000" />
                    </View>
                  )}
                </View>
                <View style={[
                  { alignSelf: 'center', position: 'relative', flex: 1, zIndex: 2, alignItems: 'flex-start' }
                ]}>
                  {/* First name */}
                  <Text
                    style={[styles.fighterName, { textAlign: 'left', fontWeight: '400', color: colors.textSecondary, paddingHorizontal: 4, flexShrink: 0 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fight.fighter2.firstName}
                  </Text>
                  {/* Last name */}
                  <Text
                    style={[styles.fighterLastName, { textAlign: 'left', color: colors.text, paddingHorizontal: 4, flexShrink: 0 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fight.fighter2.lastName}
                  </Text>
                </View>
              </View>
            </View>
          </View>

            {/* Event info inside card (when showEvent=true) */}
            {showEvent && (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 10,
                  textAlign: 'center',
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {fight.event.name} • {formatDate(fight.event.date)}
              </Text>
            )}
          </View>

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
      </Animated.View>
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
  checkmarkContainer: {
    position: 'absolute',
    bottom: -8,
    left: 0,
    right: 0,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  checkmarkIcon: {
    width: 20,
    height: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
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
  fighterNamesContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fighter1Container: {
    flex: 1,
    paddingRight: 4,
    justifyContent: 'center',
    marginLeft: -5,
  },
  fighter2Container: {
    flex: 1,
    paddingLeft: 4,
    justifyContent: 'center',
  },
  vsContainer: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -10 }],
    zIndex: 1,
  },
  fighterNamesVs: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  fighterWithBadge: {
    position: 'relative',
    flex: 1,
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
    fontSize: 13,
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
  },
  badgesBelow: {
    position: 'absolute',
    bottom: -14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  methodBadgeSmall: {
    backgroundColor: '#F5C518',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  methodBadgeSmallText: {
    color: '#000000',
    fontSize: 7,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  methodBadgeSmallHollow: {
    backgroundColor: 'transparent',
    paddingHorizontal: 2,
    paddingVertical: 0,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#808080',
  },
  methodBadgeSmallHollowText: {
    color: '#808080',
    fontSize: 7,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  ratingSquare: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  userRatingSquare: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  ratingSquareText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  fighterImagesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    marginTop: 8,
    marginBottom: 8,
  },
  fighterImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 0,
  },
  liveNowStrip: {
    backgroundColor: '#FF0000',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveNowStripText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  hypeSquare: {
    position: 'absolute',
    top: 6,
    left: 0,
    width: 48,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  userHypeSquare: {
    position: 'absolute',
    top: 6,
    right: 0,
    width: 48,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  hypeSquareNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  fighterLastName: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  fighterHeadshot: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  fighterImageWrapper: {
    position: 'relative',
    width: 50,
    height: 50,
  },
  userPredictionIndicatorLeft: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F5C518',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  userPredictionIndicatorRight: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F5C518',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  notificationBellIndicator: {
    position: 'absolute',
    left: '50%',
    top: '25%',
    transform: [{ translateX: -8 }],
    zIndex: 20,
  },
});

// Memoize to prevent unnecessary re-renders when parent re-renders
export default memo(LiveFightCard);
