import React, { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions, Alert, ViewStyle } from 'react-native';
import { FontAwesome, FontAwesome6, Entypo } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { router } from 'expo-router';
import { useAuth } from '../../store/AuthContext';
import { usePredictionAnimation } from '../../store/PredictionAnimationContext';
import { useFocusEffect } from '@react-navigation/native';
import { BaseFightCardProps } from './shared/types';
import { getFighterImage, getFighterName, cleanFighterName, formatDate, getLastName, formatEventName } from './shared/utils';
import { sharedStyles } from './shared/styles';
import { LinearGradient } from 'expo-linear-gradient';
import { getHypeHeatmapColor } from '../../utils/heatmap';
import Svg, { Circle } from 'react-native-svg';

// Hoisted outside component to avoid recreation on every render
const DEFAULT_FIGHTER_IMAGE = require('../../assets/fighters/fighter-default-alpha.png');

// PredictionArc component - moved outside to prevent recreation on every render
// Draws a 1/6 circle arc (60°)
// Blue: 9 to 7 o'clock (left side) - rotation 120°
// Yellow: 7 to 5 o'clock (bottom-left) - rotation 60°
const PredictionArc = memo(({ color, position, size = 54 }: { color: string; position: 'left' | 'bottom-left'; size?: number }) => {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sixthArc = circumference / 6; // 60° arc

  // SVG circle starts at 3 o'clock and goes clockwise
  const rotation = position === 'left' ? 120 : 60;

  return (
    <View style={[predictionArcStyle, { width: size, height: size }]}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: `${rotation}deg` }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${sixthArc} ${circumference - sixthArc}`}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
});

const predictionArcStyle: ViewStyle = {
  position: 'absolute',
  top: -2,
  left: -2,
  zIndex: 10,
};

interface UpcomingFightCardProps extends BaseFightCardProps {
  isNextFight?: boolean;
  hasLiveFight?: boolean;
  lastCompletedFightTime?: string;
  animatePrediction?: boolean;
  enableHypeAnimation?: boolean; // Only true on list screens, prevents animation on detail screens
  // Pre-fetched stats from parent (avoids N+1 API calls per card)
  predictionStats?: any;
  aggregateStats?: any;
  index?: number; // For alternating background colors
}

function UpcomingFightCard({
  fight,
  onPress,
  showEvent = true,
  isNextFight = false,
  hasLiveFight = false,
  lastCompletedFightTime,
  animatePrediction = false,
  enableHypeAnimation = false,
  predictionStats: propPredictionStats,
  aggregateStats: propAggregateStats,
  index,
}: UpcomingFightCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { pendingAnimationFightId, setPendingAnimation } = usePredictionAnimation();

  // Animation ref for hype animation
  const hypeScaleAnim = useRef(new Animated.Value(1)).current;
  const [isAnimating, setIsAnimating] = useState(false);

  // Local formatMethod function for this component - shows "KO" instead of "KO/TKO"
  const formatMethod = (method: string | null | undefined) => {
    if (!method) return '';
    const upper = method.toUpperCase();
    if (upper === 'KO_TKO' || upper === 'KO/TKO' || upper === 'KO' || upper === 'TKO') return 'KO';
    if (upper === 'DECISION' || upper.startsWith('DECISION')) return 'DEC';
    if (upper === 'SUBMISSION') return 'SUB';
    return method;
  };


  // Image error states
  const [fighter1ImageError, setFighter1ImageError] = useState(false);
  const [fighter2ImageError, setFighter2ImageError] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string>('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(50)).current;


  // Pre-compute fighter full names to avoid repeated string concatenation
  const fighter1FullName = useMemo(
    () => `${fight.fighter1.firstName} ${fight.fighter1.lastName}`,
    [fight.fighter1.firstName, fight.fighter1.lastName]
  );
  const fighter2FullName = useMemo(
    () => `${fight.fighter2.firstName} ${fight.fighter2.lastName}`,
    [fight.fighter2.firstName, fight.fighter2.lastName]
  );

  // Use fight object data directly - no need for separate API calls
  const predictionStats = useMemo(() => ({
    averageHype: fight.averageHype || 0,
    totalPredictions: 0, // Not needed for card display
  }), [fight.averageHype]);

  // Derive user's predicted winner name from fight.userPredictedWinner (fighter ID)
  const aggregateStats = useMemo(() => {
    // Check if user has predicted a winner (userPredictedWinner is a fighter ID)
    let winnerName: string | null = null;
    if ((fight as any).userPredictedWinner) {
      if ((fight as any).userPredictedWinner === fight.fighter1.id) {
        winnerName = fighter1FullName;
      } else if ((fight as any).userPredictedWinner === fight.fighter2.id) {
        winnerName = fighter2FullName;
      }
    }

    return {
      userPrediction: (fight.userHypePrediction || winnerName) ? {
        winner: winnerName,
        method: (fight as any).userPredictedMethod || null,
      } : null,
      communityPrediction: null,
    };
  }, [fight.userHypePrediction, (fight as any).userPredictedWinner, fight.fighter1.id, fight.fighter2.id, fighter1FullName, fighter2FullName]);

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


  // Hype animation - triggers when screen comes into focus AND pendingAnimationFightId matches
  // Using useFocusEffect ensures animation only runs when navigating BACK to this screen
  useFocusEffect(
    useCallback(() => {
      // Only animate if enabled (list screens only) and this is the fight that needs animation
      if (!enableHypeAnimation || pendingAnimationFightId !== fight.id) {
        return;
      }

      // Start animation after short delay for smooth transition
      const timer = setTimeout(() => {
        setIsAnimating(true);
        // Animate hype square: scale up and down twice
        Animated.sequence([
          Animated.timing(hypeScaleAnim, {
            toValue: 1.6,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(hypeScaleAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(hypeScaleAnim, {
            toValue: 1.6,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(hypeScaleAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Clear the pending animation flag after animation completes
          setIsAnimating(false);
          setPendingAnimation(null);
        });
      }, 300); // Short delay for smooth screen transition

      return () => clearTimeout(timer);
    }, [enableHypeAnimation, pendingAnimationFightId, fight.id, hypeScaleAnim, setPendingAnimation])
  );

  // Memoize image sources to avoid recalculation on every render
  const fighter1ImageSource = useMemo(
    () => fighter1ImageError ? DEFAULT_FIGHTER_IMAGE : getFighterImage(fight.fighter1),
    [fighter1ImageError, fight.fighter1]
  );
  const fighter2ImageSource = useMemo(
    () => fighter2ImageError ? DEFAULT_FIGHTER_IMAGE : getFighterImage(fight.fighter2),
    [fighter2ImageError, fight.fighter2]
  );

  // Memoized callbacks to prevent new function references on every render
  const handleFighter1ImageError = useCallback(() => setFighter1ImageError(true), []);
  const handleFighter2ImageError = useCallback(() => setFighter2ImageError(true), []);
  const handleCardPress = useCallback(() => onPress(fight), [onPress, fight]);

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
  const grayColor = colors.border || '#888888';

  const userHypeColor = useMemo(
    () => getHypeHeatmapColor(fight.userHypePrediction || 0),
    [fight.userHypePrediction]
  );

  // Alternating background colors for fight cards
  const isEvenRow = index !== undefined && index % 2 === 0;
  const cardBgColor = isEvenRow ? '#222222' : '#181818';

  return (
    <TouchableOpacity
      onPress={handleCardPress}
      activeOpacity={0.7}
      style={isAnimating ? { zIndex: 9999, elevation: 9999 } : undefined}
    >
      <View style={[sharedStyles.container, {
        position: 'relative',
        overflow: 'visible',
        paddingLeft: 64, // 48px square + 16px padding
        paddingVertical: 0, // No vertical padding
        paddingRight: 64, // 48px square + 16px padding
        minHeight: 62, // Reduced height after removing counts
        justifyContent: 'center',
        backgroundColor: cardBgColor,
      }]}>
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
                  {predictionStats.averageHype === 10 ? '10' : predictionStats.averageHype.toFixed(1)}
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

          {/* User hype flame icon on the right */}
          <View style={styles.userHypeFlameContainer}>
            {(fight.userHypePrediction !== undefined && fight.userHypePrediction !== null && fight.userHypePrediction > 0) ? (
              <Animated.View style={[styles.userHypeFlameWrapper, { transform: [{ scale: hypeScaleAnim }] }]}>
                <FontAwesome6
                  name="fire-flame-curved"
                  size={42}
                  color={userHypeColor}
                />
                <Text style={styles.userHypeFlameNumber}>
                  {Math.round(fight.userHypePrediction).toString()}
                </Text>
              </Animated.View>
            ) : (
              <FontAwesome6
                name="fire-flame-curved"
                size={32}
                color={colors.textSecondary}
                style={{ opacity: 0.3 }}
              />
            )}
          </View>

          {/* Notification bell indicator - upper right corner above flame */}
          {/* Covers: manual fight follow, following a fighter, or hype fights notification rule */}
          {fight.notificationReasons?.willBeNotified && (
            <View style={styles.notificationBellIndicator}>
              <FontAwesome name="bell" size={10} color="#F5C518" />
            </View>
          )}

          <View style={[styles.fighterNamesRow, { marginBottom: 0, marginTop: 0 }]}>
            {/* Fighter names with centered "vs" */}
            <View style={styles.fighterNamesContainer}>
              {/* Fighter 1 - Left half */}
              <View style={[styles.fighter1Container, { flexDirection: 'row', alignItems: 'center', overflow: 'visible' }]}>
                <View style={[
                  { alignSelf: 'center', position: 'relative', flex: 1, zIndex: 2, alignItems: 'flex-end' }
                ]}>
                  {/* First name */}
                  <Text
                    style={[styles.fighterName, { textAlign: 'right', fontWeight: '400', color: colors.textSecondary, backgroundColor: cardBgColor, paddingHorizontal: 4, flexShrink: 0 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fight.fighter1.firstName}
                  </Text>
                  {/* Last name */}
                  <Text
                    style={[styles.fighterLastName, { textAlign: 'right', color: colors.text, backgroundColor: cardBgColor, paddingHorizontal: 4, flexShrink: 0 }]}
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
                    source={fighter1ImageSource}
                    style={styles.fighterHeadshot}
                    onError={handleFighter1ImageError}
                  />
                  {/* User prediction indicator - yellow circle with user icon (bottom-left for fighter 1) */}
                  {aggregateStats?.userPrediction?.winner === fighter1FullName && (
                    <View style={styles.userPredictionIndicatorLeft}>
                      <FontAwesome name="user" size={11} color="#000000" />
                    </View>
                  )}
                </View>
              </View>

              {/* Fighter 2 - Right half */}
              <View style={[styles.fighter2Container, { flexDirection: 'row', alignItems: 'center', overflow: 'visible' }]}>
                {/* Fighter 2 headshot - left of name */}
                <View style={[styles.fighterImageWrapper, { marginRight: 6, marginLeft: -3 }]}>
                  <Image
                    source={fighter2ImageSource}
                    style={styles.fighterHeadshot}
                    onError={handleFighter2ImageError}
                  />
                  {/* User prediction indicator - yellow circle with user icon (bottom-right for fighter 2) */}
                  {aggregateStats?.userPrediction?.winner === fighter2FullName && (
                    <View style={styles.userPredictionIndicatorRight}>
                      <FontAwesome name="user" size={11} color="#000000" />
                    </View>
                  )}
                </View>
                <View style={[
                  { alignSelf: 'center', position: 'relative', flex: 1, zIndex: 2, alignItems: 'flex-start' }
                ]}>
                  {/* First name */}
                  <Text
                    style={[styles.fighterName, { textAlign: 'left', fontWeight: '400', color: colors.textSecondary, backgroundColor: cardBgColor, paddingHorizontal: 4, flexShrink: 0 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fight.fighter2.firstName}
                  </Text>
                  {/* Last name */}
                  <Text
                    style={[styles.fighterLastName, { textAlign: 'left', color: colors.text, backgroundColor: cardBgColor, paddingHorizontal: 4, flexShrink: 0 }]}
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
              {formatEventName(fight.event.name)} • {formatDate(fight.event.date)}
            </Text>
          )}

        {/* Bell icon - hidden but functionality preserved */}
        {false && isAuthenticated && (
          <TouchableOpacity
            style={styles.bellButton}
            onPress={handleBellPress}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <FontAwesome
              name={fight.isFollowing ? "bell" : "bell-o"}
              size={18}
              color={fight.isFollowing ? '#F5C518' : colors.textSecondary}
            />
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
  predictionArcContainer: {
    position: 'absolute',
    top: -2,
    left: -2,
    zIndex: 10,
  },
  userPredictionIndicatorLeft: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F5C518',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  userPredictionIndicatorRight: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F5C518',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  notificationBellIndicator: {
    position: 'absolute',
    top: 6,
    right: 4,
    zIndex: 25,
  },
  vsContainer: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -5 }],
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
  fighterLastName: {
    fontSize: 16,
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
    minWidth: 28,
    height: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
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
  hypeCountContainer: {
    position: 'absolute',
    top: 4,
    left: 54,
    height: 82, // Match taller box height
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  hypeCountValue: {
    fontSize: 11,
    fontWeight: '500',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
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
  userHypeFlameContainer: {
    position: 'absolute',
    top: 6,
    right: 0,
    width: 48,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
    overflow: 'visible',
  },
  userHypeFlameWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  userHypeFlameNumber: {
    position: 'absolute',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    top: 11,
  },
  hypeSquareText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  hypeSquareNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hypeSquareCount: {
    position: 'absolute',
    bottom: 9,
    color: 'rgba(0,0,0,0.5)',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  userCommentInsideBox: {
    position: 'absolute',
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  userCommentInsideBoxCount: {
    color: 'rgba(0,0,0,0.5)',
    fontSize: 9,
    fontWeight: '600',
  },
  userCommentIndicator: {
    position: 'absolute',
    top: 4, // Aligned with numHypers on left side
    right: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  userCommentCount: {
    fontSize: 11,
    fontWeight: '500',
  },
  predictedWinnerContainer: {
    backgroundColor: '#F5C518',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userMethodBadge: {
    backgroundColor: 'transparent',
    paddingHorizontal: 1,
    paddingVertical: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userMethodBadgeText: {
    color: '#F5C518',
    fontSize: 10,
    fontWeight: '600',
  },
  communityMethodBadge: {
    backgroundColor: 'transparent',
    paddingHorizontal: 1,
    paddingVertical: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  communityMethodBadgeText: {
    color: '#4A90D9',
    fontSize: 10,
    fontWeight: '600',
  },
  miniPredictionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    gap: 6,
  },
  miniPredictionBarTrack: {
    flex: 1,
    maxWidth: 130,
    height: 6,
    flexDirection: 'row',
    borderRadius: 3,
  },
  miniPredictionBarFill: {
    height: '100%',
  },
  miniPredictionText: {
    fontSize: 10,
    fontWeight: '600',
  },
  userPredictionIndicator: {
    position: 'absolute',
    top: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// Memoize to prevent unnecessary re-renders when parent re-renders
export default memo(UpcomingFightCard);
