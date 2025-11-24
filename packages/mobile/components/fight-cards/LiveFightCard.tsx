import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions, Alert } from 'react-native';
import { FontAwesome, FontAwesome6, Entypo } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { router } from 'expo-router';
import { useAuth } from '../../store/AuthContext';
import { usePredictionAnimation } from '../../store/PredictionAnimationContext';
import { BaseFightCardProps } from './shared/types';
import { getFighterImage, getFighterName, cleanFighterName, formatDate, getLastName } from './shared/utils';
import { sharedStyles } from './shared/styles';
import { LinearGradient } from 'expo-linear-gradient';
import { getHypeHeatmapColor } from '../../utils/heatmap';
import { useFightStats } from '../../hooks/useFightStats';

interface LiveFightCardProps extends BaseFightCardProps {
  animateRating?: boolean;
}

export default function LiveFightCard({
  fight,
  onPress,
  showEvent = true,
  animateRating = false,
}: LiveFightCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { pendingRatingAnimationFightId, setPendingRatingAnimation } = usePredictionAnimation();

  // Animation ref for rating animation
  const ratingScaleAnim = useRef(new Animated.Value(1)).current;

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

  // Fetch both prediction stats and aggregate stats in a single API call
  const { data } = useFightStats(fight.id);
  const predictionStats = data?.predictionStats;
  const aggregateStats = data?.aggregateStats;

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

  const hypeBorderColor = getHypeHeatmapColor(predictionStats?.averageHype || 0);
  const ratingBorderColor = getHypeHeatmapColor(fight.averageRating || 0);
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

  // Mix 70% heatmap color with 30% background color for flame icon
  const getFlameColor = (hypeColor: string, bgColor: string): string => {
    // Parse hype color (RGB or hex)
    const hypeRgbaMatch = hypeColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    const hypeHexMatch = hypeColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

    let hypeR = 0, hypeG = 0, hypeB = 0;
    if (hypeRgbaMatch) {
      hypeR = parseInt(hypeRgbaMatch[1]);
      hypeG = parseInt(hypeRgbaMatch[2]);
      hypeB = parseInt(hypeRgbaMatch[3]);
    } else if (hypeHexMatch) {
      hypeR = parseInt(hypeHexMatch[1], 16);
      hypeG = parseInt(hypeHexMatch[2], 16);
      hypeB = parseInt(hypeHexMatch[3], 16);
    }

    // Parse background color (RGB or hex)
    const bgRgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    const bgHexMatch = bgColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

    let bgR = 0, bgG = 0, bgB = 0;
    if (bgRgbaMatch) {
      bgR = parseInt(bgRgbaMatch[1]);
      bgG = parseInt(bgRgbaMatch[2]);
      bgB = parseInt(bgRgbaMatch[3]);
    } else if (bgHexMatch) {
      bgR = parseInt(bgHexMatch[1], 16);
      bgG = parseInt(bgHexMatch[2], 16);
      bgB = parseInt(bgHexMatch[3], 16);
    }

    // Mix 70% hype + 30% background
    const mixedR = Math.round(hypeR * 0.7 + bgR * 0.3);
    const mixedG = Math.round(hypeG * 0.7 + bgG * 0.3);
    const mixedB = Math.round(hypeB * 0.7 + bgB * 0.3);

    return `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
  };

  const flameColor = getFlameColor(hypeBorderColor, colors.background);
  const starColor = getFlameColor(ratingBorderColor, colors.background);

  const userRatingColor = getHypeHeatmapColor(fight.userRating || 0);
  const userStarColor = getFlameColor(userRatingColor, colors.background);

  return (
    <TouchableOpacity onPress={() => router.push(`/completed-fight/${fight.id}`)} activeOpacity={0.7}>
      <View style={[sharedStyles.container, {
        position: 'relative',
        overflow: 'hidden',
        paddingLeft: 16, // No squares, just padding
        paddingVertical: 0, // No vertical padding - let live strip and content handle it
        paddingRight: 16, // No squares, just padding
        minHeight: 40, // Minimum height to ensure content fits
        justifyContent: 'center',
        backgroundColor: '#F5C518', // Pure primary yellow
        marginTop: 10,
        marginBottom: 10,
      }]}>
          {/* Live Now Strip at Top */}
          <View style={styles.liveNowStrip}>
            <Text style={styles.liveNowStripText}>Live Now</Text>
          </View>

          <View style={[styles.fighterNamesRow, { marginBottom: 0, marginTop: showEvent ? -10 : 8 }]}>
            {/* Fighter names with centered "vs" */}
            <View style={styles.fighterNamesContainer}>
              {/* Fighter 1 - Left half */}
              <View style={styles.fighter1Container}>
                <View
                  style={[
                    { alignSelf: 'flex-end', position: 'relative' },
                    aggregateStats?.userPrediction?.winner === `${fight.fighter1.firstName} ${fight.fighter1.lastName}` && {
                      borderBottomWidth: 2,
                      borderBottomColor: '#F5C518',
                    }
                  ]}
                >
                  <Text
                    style={[styles.fighterName, { color: '#000000', textAlign: 'right' }]}
                    numberOfLines={1}
                  >
                    {cleanFighterName(getFighterName(fight.fighter1))}
                  </Text>
                  {/* Checkmark for correct prediction */}
                  {aggregateStats?.userPrediction?.winner === `${fight.fighter1.firstName} ${fight.fighter1.lastName}` &&
                   fight.winner === fight.fighter1.id && (
                    <View style={styles.checkmarkContainer}>
                      <View style={[styles.checkmarkIcon, { backgroundColor: colors.background }]}>
                        <FontAwesome name="check" size={10} color="#F5C518" />
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* "vs" text - Absolutely centered */}
              <View style={styles.vsContainer}>
                <Text style={[styles.vsText, { color: '#000000' }]}>vs</Text>
              </View>

              {/* Fighter 2 - Right half */}
              <View style={styles.fighter2Container}>
                <View
                  style={[
                    { alignSelf: 'flex-start', position: 'relative' },
                    aggregateStats?.userPrediction?.winner === `${fight.fighter2.firstName} ${fight.fighter2.lastName}` && {
                      borderBottomWidth: 2,
                      borderBottomColor: '#F5C518',
                    }
                  ]}
                >
                  <Text
                    style={[styles.fighterName, { color: '#000000', textAlign: 'left' }]}
                    numberOfLines={1}
                  >
                    {cleanFighterName(getFighterName(fight.fighter2))}
                  </Text>
                  {/* Checkmark for correct prediction */}
                  {aggregateStats?.userPrediction?.winner === `${fight.fighter2.firstName} ${fight.fighter2.lastName}` &&
                   fight.winner === fight.fighter2.id && (
                    <View style={styles.checkmarkContainer}>
                      <View style={[styles.checkmarkIcon, { backgroundColor: colors.background }]}>
                        <FontAwesome name="check" size={10} color="#F5C518" />
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Event text positioned absolutely below fighter names */}
            {showEvent && (
              <Text
                style={{
                  position: 'absolute',
                  bottom: -19,
                  left: 0,
                  right: 0,
                  color: colors.textSecondary,
                  fontSize: 10,
                  textAlign: 'center',
                }}
                numberOfLines={1}
              >
                {fight.event.name} • {formatDate(fight.event.date)}
              </Text>
            )}
          </View>

          {/* Fighter Images Row */}
          <View style={styles.fighterImagesRow}>
            <Image
              source={getFighter1ImageSource()}
              style={styles.fighterImage}
              onError={() => setFighter1ImageError(true)}
            />
            <Image
              source={getFighter2ImageSource()}
              style={styles.fighterImage}
              onError={() => setFighter2ImageError(true)}
            />
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
    paddingRight: 12,
    justifyContent: 'center',
    marginLeft: -5,
  },
  fighter2Container: {
    flex: 1,
    paddingLeft: 12,
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
    marginLeft: -16,
    marginRight: -16,
    marginTop: 0,
  },
  liveNowStripText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
});
