import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';

interface FightDisplayCardMinimalProps {
  fightData: {
    id: string;
    fighter1: string;
    fighter2: string;
    isMainEvent: boolean;
    isMainCard?: boolean;
    cardPosition?: number;
    weightClass: string;
    scheduledRounds: number;
    status: 'upcoming' | 'in_progress' | 'completed';
    fightStatus: string;
    aggregateRating: number | null;
    totalRatings: number;
    aggregateHype?: number | null; // For upcoming fights
    totalHypePredictions?: number; // For upcoming fights
    userRating?: number | null;
    userReview?: { content: string; rating: number; createdAt: string; } | null;
    userTags?: string[] | null;
    userHypePrediction?: number | null; // For upcoming fights
    result?: string;
    startTime?: string;
    completedAt?: string;
    currentRound?: number;
    completedRounds?: number;
  };
  onPress: (fightData: any) => void;
  animateRating?: boolean; // Trigger rating save animation
}

export default function FightDisplayCardMinimal({ fightData, onPress, animateRating }: FightDisplayCardMinimalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Animated value for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animated values for rating save animation
  const ratingScaleAnim = useRef(new Animated.Value(1)).current;
  const ratingGlowAnim = useRef(new Animated.Value(0)).current;
  const sparkle1 = useRef(new Animated.Value(0)).current; // top-right
  const sparkle2 = useRef(new Animated.Value(0)).current; // top-left
  const sparkle3 = useRef(new Animated.Value(0)).current; // bottom-right
  const sparkle4 = useRef(new Animated.Value(0)).current; // bottom-left
  const sparkle5 = useRef(new Animated.Value(0)).current; // top
  const sparkle6 = useRef(new Animated.Value(0)).current; // bottom
  const sparkle7 = useRef(new Animated.Value(0)).current; // left
  const sparkle8 = useRef(new Animated.Value(0)).current; // right

  // Start pulsing animation for live fights
  useEffect(() => {
    if (fightData.status === 'in_progress') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [fightData.status, pulseAnim]);

  // Trigger rating/prediction save animation
  useEffect(() => {
    if (animateRating && (fightData.userRating || fightData.userHypePrediction)) {
      // Reset sparkles
      sparkle1.setValue(0);
      sparkle2.setValue(0);
      sparkle3.setValue(0);
      sparkle4.setValue(0);
      sparkle5.setValue(0);
      sparkle6.setValue(0);
      sparkle7.setValue(0);
      sparkle8.setValue(0);

      // Scale pop animation with glow and sparkles
      Animated.parallel([
        // Main scale animation
        Animated.sequence([
          Animated.timing(ratingScaleAnim, {
            toValue: 1.3,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(ratingScaleAnim, {
            toValue: 1,
            friction: 3,
            tension: 40,
            useNativeDriver: true,
          }),
        ]),
        // Glow effect
        Animated.sequence([
          Animated.timing(ratingGlowAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(ratingGlowAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        // Sparkle 1 (top-right)
        Animated.timing(sparkle1, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        // Sparkle 2 (top-left)
        Animated.timing(sparkle2, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        // Sparkle 3 (bottom-right)
        Animated.timing(sparkle3, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        // Sparkle 4 (bottom-left)
        Animated.timing(sparkle4, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        // Sparkle 5 (top)
        Animated.timing(sparkle5, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        // Sparkle 6 (bottom)
        Animated.timing(sparkle6, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        // Sparkle 7 (left)
        Animated.timing(sparkle7, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        // Sparkle 8 (right)
        Animated.timing(sparkle8, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animateRating]);

  // Fetch aggregate prediction stats for upcoming fights
  const { data: predictionStats } = useQuery({
    queryKey: ['fightPredictionStats', fightData.id],
    queryFn: () => apiService.getFightPredictionStats(fightData.id),
    enabled: fightData.status === 'upcoming',
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Helper function to remove nicknames from fighter names
  const cleanFighterName = (displayName: string) => {
    // Handle format: FirstName LastName "Nickname" -> FirstName LastName
    const nicknameMatch = displayName.match(/^(.+)\s+"([^"]+)"$/);
    return nicknameMatch ? nicknameMatch[1].trim() : displayName;
  };

  // Helper function to clean fight result text
  const cleanFightResult = (result: string) => {
    // Remove first names, keep only last names and method
    // Example: "Jon Jones defeats Max Holloway by TKO" -> "Jones defeats Holloway by TKO"
    return result
      .replace(/([A-Z][a-z]+)\s+([A-Z][a-z]+)/g, '$2') // Replace "FirstName LastName" with "LastName"
      .replace(/\s+/g, ' ') // Clean up extra spaces
      .trim();
  };

  // Check if user has interacted with the fight (rated, reviewed, tagged, or predicted hype)
  const hasUserInteracted = () => {
    return !!(fightData.userRating ||
              fightData.userReview ||
              fightData.userHypePrediction ||
              (fightData.userTags && fightData.userTags.length > 0));
  };

  // Determine background color based on fight status
  const getBackgroundColor = () => {
    switch (fightData.status) {
      case 'completed':
        return colors.card; // Same as upcoming fights
      case 'in_progress':
        return colors.primary; // Golden/yellow for live fight
      case 'upcoming':
      default:
        return colors.card; // Default card color
    }
  };

  // Determine text color based on fight status
  const getTextColor = () => {
    return fightData.status === 'in_progress' ? colors.textOnAccent : colors.text;
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: getBackgroundColor() }]}
      onPress={() => onPress(fightData)}
      activeOpacity={0.7}
    >
      {fightData.isMainEvent && (
        <Text style={[styles.mainEventLabel, { color: fightData.status === 'in_progress' ? colors.textOnAccent : colors.tint }]}>
          MAIN EVENT
        </Text>
      )}

      {/* Fighter Names - Full Width */}
      <Text style={[styles.matchup, { color: getTextColor() }]}>
        {cleanFighterName(fightData.fighter1)} vs {cleanFighterName(fightData.fighter2)}
      </Text>

      {/* Horizontal Info Row - Aggregate Rating/Hype, My Rating/Prediction, Fight Status */}
      <View style={styles.horizontalInfoRow}>
        {/* Aggregate Score / Live Indicator */}
        {fightData.status === 'upcoming' ? (
          // Aggregate Hype for upcoming fights (with placeholder if no data)
          <View style={styles.ratingRow}>
            <FontAwesome6
              name="fire-flame-curved"
              size={20}
              color={colors.primary}
              style={styles.ratingIcon}
            />
            <Text style={[styles.aggregateLabel, { color: colors.textSecondary }]}>
              {predictionStats?.averageHype ? predictionStats.averageHype.toFixed(1) : (fightData.aggregateHype || '8.2')}
            </Text>
          </View>
        ) : fightData.status === 'in_progress' ? (
          // Live indicator for in-progress fights
          <View style={styles.liveContainer}>
            {/* Pulsing dot for live indicator */}
            {!fightData.currentRound && !fightData.completedRounds && (
              <Animated.View style={[
                styles.liveDot,
                {
                  backgroundColor: colors.danger,
                  opacity: pulseAnim
                }
              ]} />
            )}
            <Text style={[styles.statusText, { color: colors.danger }]} numberOfLines={1}>
              {fightData.currentRound ? `Round ${fightData.currentRound}` :
               fightData.completedRounds ? `End R${fightData.completedRounds}` : 'Live'}
            </Text>
          </View>
        ) : (
          // Aggregate Rating for completed fights
          fightData.fightStatus === 'COMPLETED' && fightData.aggregateRating && (
            <View style={styles.ratingRow}>
              <View style={styles.partialStarContainer}>
                {/* Empty star (outline) */}
                <FontAwesome
                  name="star-o"
                  size={20}
                  color="#F5C518"
                  style={styles.starBase}
                />
                {/* Filled star (clipped based on rating) */}
                <View style={[
                  styles.filledStarContainer,
                  {
                    height: `${Math.min(100, Math.max(0, fightData.aggregateRating === 10 ? 100 : fightData.aggregateRating * 8.5))}%`,
                  }
                ]}>
                  <FontAwesome
                    name="star"
                    size={20}
                    color="#F5C518"
                    style={styles.starFilled}
                  />
                </View>
              </View>
              <Text style={[styles.aggregateLabel, { color: colors.textSecondary }]}>
                {fightData.aggregateRating}
              </Text>
            </View>
          )
        )}

        {/* User's Personal Rating/Prediction */}
        <View style={{ position: 'relative' }}>
          {/* Sparkle particles */}
          {(fightData.userRating || fightData.userHypePrediction) && (
            <>
              {/* Top-right sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: -10,
                  right: -10,
                  opacity: sparkle1.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: sparkle1.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateX: sparkle1.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                    { translateY: sparkle1.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#FFD700" />
              </Animated.View>

              {/* Top-left sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: -10,
                  left: -10,
                  opacity: sparkle2.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: sparkle2.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateX: sparkle2.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                    { translateY: sparkle2.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#FFD700" />
              </Animated.View>

              {/* Bottom-right sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  bottom: -10,
                  right: -10,
                  opacity: sparkle3.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: sparkle3.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateX: sparkle3.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                    { translateY: sparkle3.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#FFD700" />
              </Animated.View>

              {/* Bottom-left sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  bottom: -10,
                  left: -10,
                  opacity: sparkle4.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: sparkle4.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateX: sparkle4.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                    { translateY: sparkle4.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#FFD700" />
              </Animated.View>

              {/* Top sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: -10,
                  left: '50%',
                  marginLeft: -6, // Half of star size to center
                  opacity: sparkle5.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: sparkle5.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateY: sparkle5.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#FFD700" />
              </Animated.View>

              {/* Bottom sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  bottom: -10,
                  left: '50%',
                  marginLeft: -6, // Half of star size to center
                  opacity: sparkle6.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: sparkle6.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateY: sparkle6.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#FFD700" />
              </Animated.View>

              {/* Left sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: 2,
                  left: -10,
                  opacity: sparkle7.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { translateY: 0 },
                    { translateX: sparkle7.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                    { scale: sparkle7.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#FFD700" />
              </Animated.View>

              {/* Right sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: 2,
                  right: -10,
                  opacity: sparkle8.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { translateY: 0 },
                    { translateX: sparkle8.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                    { scale: sparkle8.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#FFD700" />
              </Animated.View>
            </>
          )}

          {/* Glow effect behind rating */}
          <Animated.View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#83B4F3',
            borderRadius: 20,
            opacity: ratingGlowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.3],
            }),
            transform: [{ scale: ratingGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
          }} />

          {/* Main rating content */}
          <Animated.View style={{
            transform: [{ scale: ratingScaleAnim }],
          }}>
            <View style={styles.ratingRow}>
              {fightData.status === 'upcoming' ? (
                // Flame for upcoming fights (predictions)
                <>
                  <FontAwesome6
                    name="fire-flame-curved"
                    size={20}
                    color='#83B4F3'
                    style={styles.ratingIcon}
                  />
                  <Text style={[
                    styles.userRatingText,
                    { color: '#83B4F3' }
                  ]}>
                    {fightData.userHypePrediction ? `${fightData.userHypePrediction}` : 'Predict'}
                  </Text>
                </>
              ) : fightData.status === 'in_progress' ? (
                // Star for in-progress fights (ratings)
                <>
                  <FontAwesome
                    name={fightData.userRating ? "star" : "star-o"}
                    size={20}
                    color={colors.textOnAccent}
                    style={styles.ratingIcon}
                  />
                  <Text style={[
                    styles.userRatingText,
                    { color: colors.textOnAccent }
                  ]}>
                    {fightData.userRating ? `${fightData.userRating}` : 'Rate'}
                  </Text>
                </>
              ) : (
                // Star for completed fights (ratings)
                <>
                  <FontAwesome
                    name={fightData.userRating ? "star" : "star-o"}
                    size={20}
                    color="#83B4F3"
                    style={styles.ratingIcon}
                  />
                  <Text style={[
                    styles.userRatingText,
                    { color: '#83B4F3' }
                  ]}>
                    {fightData.userRating ? `${fightData.userRating}` : 'Rate'}
                  </Text>
                </>
              )}
            </View>
          </Animated.View>
        </View>

        {/* Fight Status and Results */}
        <View style={styles.statusContainer}>
          {fightData.status === 'completed' && fightData.result && hasUserInteracted() && (
            <Text style={[styles.result, { color: colors.text }]}>
              {cleanFightResult(fightData.result)}
            </Text>
          )}

          {fightData.status === 'upcoming' && fightData.startTime && (
            <Text style={[styles.statusText, { color: colors.textSecondary }]} numberOfLines={1}>
              Starts: {fightData.startTime}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  mainEventLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 1,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fightInfo: {
    flex: 1,
  },
  matchup: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  details: {
    fontSize: 14,
  },
  result: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusContainer: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: '40%',
  },
  liveContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'flex-start',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  horizontalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ratingIcon: {
    width: 24,
    textAlign: 'center',
    marginRight: 6,
  },
  partialStarContainer: {
    position: 'relative',
    width: 24,
    height: 20,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starBase: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  filledStarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  starFilled: {
    textAlign: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  userRatingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  aggregateLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  ratingCount: {
    fontSize: 11,
  },
  sparkle: {
    position: 'absolute',
    zIndex: 10,
  },
});