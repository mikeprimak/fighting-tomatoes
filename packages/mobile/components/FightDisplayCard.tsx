import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

// Type definitions based on the existing API types
interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  wins: number;
  losses: number;
  draws: number;
}

interface Event {
  id: string;
  name: string;
  date: string;
  promotion: string;
}

export interface FightData {
  id: string;
  orderOnCard?: number;
  event: Event;
  fighter1: Fighter;
  fighter2: Fighter;
  weightClass?: string;
  isTitle: boolean;
  titleName?: string;
  averageRating: number;
  totalRatings: number;
  totalReviews: number;
  hasStarted: boolean;
  isComplete: boolean;
  watchPlatform?: string;
  watchUrl?: string;
  // User-specific data
  userRating?: number;
  userReview?: {
    content: string;
    rating: number;
    createdAt: string;
  };
  userTags?: string[];
}

interface FightDisplayCardProps {
  fight: FightData;
  onPress: (fight: FightData) => void;
  showActionButton?: boolean;
  actionButtonText?: string;
  customActionButton?: React.ReactNode;
  showEvent?: boolean;
}

export default function FightDisplayCard({
  fight,
  onPress,
  showEvent = true,
}: FightDisplayCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Animated value for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animated values for rating save animation
  const ratingScaleAnim = useRef(new Animated.Value(1)).current;
  const ratingGlowAnim = useRef(new Animated.Value(0)).current;

  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  // Helper function to remove nicknames from fighter names
  const cleanFighterName = (displayName: string) => {
    const nicknameMatch = displayName.match(/^(.+)\s+"([^"]+)"$/);
    return nicknameMatch ? nicknameMatch[1].trim() : displayName;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Start pulsing animation for live fights
  useEffect(() => {
    if (fight.hasStarted && !fight.isComplete) {
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
  }, [fight.hasStarted, fight.isComplete, pulseAnim]);

  // Determine fight status
  const getStatus = () => {
    if (fight.isComplete) return 'completed';
    if (fight.hasStarted) return 'in_progress';
    return 'upcoming';
  };

  const status = getStatus();

  // Determine background color based on fight status
  const getBackgroundColor = () => {
    if (status === 'in_progress') return colors.primary;
    return colors.card;
  };

  // Determine text color based on fight status
  const getTextColor = () => {
    return status === 'in_progress' ? colors.textOnAccent : colors.text;
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: getBackgroundColor() }]}
      onPress={() => onPress(fight)}
      activeOpacity={0.7}
    >
      {fight.isTitle && (
        <Text style={[styles.mainEventLabel, { color: status === 'in_progress' ? colors.textOnAccent : colors.tint }]}>
          TITLE FIGHT
        </Text>
      )}

      {showEvent && (
        <Text style={[styles.eventText, { color: status === 'in_progress' ? colors.textOnAccent : colors.textSecondary }]}>
          {fight.event.name} • {formatDate(fight.event.date)}
        </Text>
      )}

      {/* Fighter Names - Full Width */}
      <Text style={[styles.matchup, { color: getTextColor() }]}>
        {cleanFighterName(getFighterName(fight.fighter1))} vs {cleanFighterName(getFighterName(fight.fighter2))}
      </Text>

      {/* Horizontal Info Row - Aggregate Rating, My Rating, Fight Status */}
      <View style={styles.horizontalInfoRow}>
        {/* Aggregate Score / Live Indicator */}
        {status === 'upcoming' ? (
          <View style={styles.ratingRow}>
            <FontAwesome6
              name="fire-flame-curved"
              size={20}
              color={colors.primary}
              style={styles.ratingIcon}
            />
            <Text style={[styles.aggregateLabel, { color: colors.textSecondary }]}>
              8.2
            </Text>
          </View>
        ) : status === 'in_progress' ? (
          <View style={styles.liveContainer}>
            <Text style={[styles.statusText, { color: colors.danger }]} numberOfLines={1}>
              Live
            </Text>
            <Animated.View style={[
              styles.liveDot,
              {
                backgroundColor: colors.danger,
                opacity: pulseAnim
              }
            ]} />
          </View>
        ) : (
          fight.isComplete && fight.averageRating > 0 && (
            <View style={styles.ratingRow}>
              <View style={styles.partialStarContainer}>
                <FontAwesome
                  name="star-o"
                  size={20}
                  color="#F5C518"
                  style={styles.starBase}
                />
                <View style={[
                  styles.filledStarContainer,
                  {
                    height: `${Math.min(100, Math.max(0, fight.averageRating === 10 ? 100 : fight.averageRating * 8.5))}%`,
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
                {fight.averageRating.toFixed(1)}
              </Text>
            </View>
          )
        )}

        {/* User's Personal Rating */}
        <View style={{ position: 'relative' }}>
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

          <Animated.View style={{
            transform: [{ scale: ratingScaleAnim }],
          }}>
            <View style={styles.ratingRow}>
              {status === 'upcoming' ? (
                <>
                  <FontAwesome6
                    name="fire-flame-curved"
                    size={20}
                    color='#83B4F3'
                    style={styles.ratingIcon}
                  />
                  <Text style={[styles.userRatingText, { color: '#83B4F3' }]}>
                    Predict
                  </Text>
                </>
              ) : status === 'in_progress' ? (
                <>
                  <FontAwesome
                    name={fight.userRating ? "star" : "star-o"}
                    size={20}
                    color={colors.textOnAccent}
                    style={styles.ratingIcon}
                  />
                  <Text style={[styles.userRatingText, { color: colors.textOnAccent }]}>
                    {fight.userRating ? `${fight.userRating}` : 'Rate'}
                  </Text>
                </>
              ) : (
                <>
                  <FontAwesome
                    name={fight.userRating ? "star" : "star-o"}
                    size={20}
                    color="#83B4F3"
                    style={styles.ratingIcon}
                  />
                  <Text style={[styles.userRatingText, { color: '#83B4F3' }]}>
                    {fight.userRating ? `${fight.userRating}` : 'Rate'}
                  </Text>
                </>
              )}
            </View>
          </Animated.View>
        </View>

        {/* Weight Class / Status */}
        <View style={styles.statusContainer}>
          {fight.weightClass && (
            <Text style={[styles.statusText, { color: status === 'in_progress' ? colors.textOnAccent : colors.textSecondary }]} numberOfLines={1}>
              {fight.weightClass}
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
    marginBottom: 8,
  },
  mainEventLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 1,
  },
  eventText: {
    fontSize: 12,
    marginBottom: 4,
  },
  matchup: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
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
  statusContainer: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: '40%',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  liveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
