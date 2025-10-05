import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

// Type definitions based on the existing API types
interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  profileImage?: string;
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
  currentRound?: number | null;
  completedRounds?: number | null;
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

// Helper function to get fighter image (either from profileImage or placeholder)
const getFighterImage = (fighter: Fighter) => {
  // Only use profileImage if it's a valid absolute URL (starts with http)
  if (fighter.profileImage && fighter.profileImage.startsWith('http')) {
    return { uri: fighter.profileImage };
  }

  return require('../assets/fighters/fighter-5.jpg');
};

export default function FightDisplayCard({
  fight,
  onPress,
  showEvent = true,
}: FightDisplayCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // State to track image loading errors
  const [fighter1ImageError, setFighter1ImageError] = React.useState(false);
  const [fighter2ImageError, setFighter2ImageError] = React.useState(false);

  // Animated value for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animated values for rating save animation
  const ratingScaleAnim = useRef(new Animated.Value(1)).current;
  const ratingGlowAnim = useRef(new Animated.Value(0)).current;

  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  // Get fighter image source with error fallback
  const getFighter1ImageSource = () => {
    if (fighter1ImageError) {
      return require('../assets/fighters/fighter-5.jpg');
    }
    return getFighterImage(fight.fighter1);
  };

  const getFighter2ImageSource = () => {
    if (fighter2ImageError) {
      return require('../assets/fighters/fighter-5.jpg');
    }
    return getFighterImage(fight.fighter2);
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

  // Reset image error states when fight changes
  useEffect(() => {
    setFighter1ImageError(false);
    setFighter2ImageError(false);
  }, [fight.id]);

  // Start pulsing animation for live fights
  useEffect(() => {
    const isTrulyLive = fight.hasStarted && !fight.isComplete;
    if (isTrulyLive) {
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
    // A fight is "in progress" if it has started (even if we don't know the current round)
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
            <Animated.View style={[
              styles.liveDot,
              {
                backgroundColor: colors.danger,
                opacity: pulseAnim
              }
            ]} />
            <Text style={[styles.statusText, { color: colors.danger }]} numberOfLines={1}>
              Live
            </Text>
          </View>
        ) : (
          fight.isComplete && (
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

        {/* Fighter Headshots */}
        <View style={styles.headshotsContainer}>
          <Image
            source={getFighter1ImageSource()}
            style={styles.fighterHeadshot}
            onError={() => setFighter1ImageError(true)}
          />
          <Image
            source={getFighter2ImageSource()}
            style={styles.fighterHeadshot}
            onError={() => setFighter2ImageError(true)}
          />
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
  headshotsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  fighterHeadshot: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  liveContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'flex-start',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
