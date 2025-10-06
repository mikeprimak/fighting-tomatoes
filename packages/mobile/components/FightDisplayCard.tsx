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
  // Fight outcome data
  winner?: string | null;
  method?: string | null;
  round?: number | null;
  time?: string | null;
  updatedAt?: string;
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
  isNextFight?: boolean; // Indicates if this is the next fight to start
  hasLiveFight?: boolean; // Indicates if any fight is currently live
  lastCompletedFightTime?: string; // updatedAt timestamp of most recently completed fight
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
  isNextFight = false,
  hasLiveFight = false,
  lastCompletedFightTime,
}: FightDisplayCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // State to track image loading errors
  const [fighter1ImageError, setFighter1ImageError] = React.useState(false);
  const [fighter2ImageError, setFighter2ImageError] = React.useState(false);

  // Track when "Up next..." first appeared for this fight - use ref to persist across renders
  const upNextStartTimeRef = useRef<number | null>(null);

  // Animated value for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animated value for "Starting soon..." text pulse
  const startingSoonPulseAnim = useRef(new Animated.Value(1)).current;

  // Animated values for rating save animation
  const ratingScaleAnim = useRef(new Animated.Value(1)).current;
  const ratingGlowAnim = useRef(new Animated.Value(0)).current;

  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  // Get outcome text for completed fights
  const getOutcomeText = () => {
    if (!fight.isComplete || !fight.winner || !fight.method) return null;

    // Determine winner name
    let winnerName = '';
    if (fight.winner === 'draw') {
      winnerName = 'Draw';
    } else if (fight.winner === 'nc') {
      winnerName = 'No Contest';
    } else if (fight.winner === fight.fighter1.id) {
      winnerName = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
    } else if (fight.winner === fight.fighter2.id) {
      winnerName = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
    } else {
      return null;
    }

    // Build outcome string
    const roundText = fight.round ? `R${fight.round}` : '';
    const timeText = fight.time ? ` ${fight.time}` : '';
    const roundTimeText = roundText || timeText ? ` - ${roundText}${timeText}` : '';

    if (fight.winner === 'draw' || fight.winner === 'nc') {
      return `${winnerName}${roundTimeText}`;
    }

    return `${winnerName} via ${fight.method}${roundTimeText}`;
  };

  // Force re-render every second when this is the next fight and not live
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    if (isNextFight && !hasLiveFight && !fight.hasStarted) {
      const interval = setInterval(forceUpdate, 1000);
      return () => clearInterval(interval);
    }
  }, [isNextFight, hasLiveFight, fight.hasStarted]);

  // Get status message for upcoming fights
  const getUpcomingStatusMessage = () => {
    // Only show for the next fight that hasn't started
    if (!isNextFight || fight.hasStarted || fight.isComplete) {
      // Reset start time if conditions no longer met
      upNextStartTimeRef.current = null;
      return null;
    }

    // Don't show any message if another fight is currently live
    if (hasLiveFight) {
      // Reset start time while a fight is live
      upNextStartTimeRef.current = null;
      return null;
    }

    // Initialize start time when this fight first becomes "next" with no live fight
    if (!upNextStartTimeRef.current && lastCompletedFightTime) {
      upNextStartTimeRef.current = Date.now();
      console.log(`Fight ${fight.id} - Starting "Up next..." timer at ${new Date().toISOString()}`);
    }

    // Use the stored start time to determine which message to show
    if (upNextStartTimeRef.current) {
      const now = Date.now();
      const secondsSinceStart = (now - upNextStartTimeRef.current) / 1000;

      console.log(`Fight ${fight.id} - Seconds since "Up next...": ${secondsSinceStart.toFixed(1)}s`);

      // Show "Up next..." for first 15 seconds
      if (secondsSinceStart < 15) {
        return 'Up next...';
      } else {
        // After 15 seconds, show "Starting soon..."
        return 'Starting soon...';
      }
    }

    return null;
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

  // Start pulsing animation for "Starting soon..." text
  useEffect(() => {
    const statusMessage = getUpcomingStatusMessage();
    if (statusMessage === 'Starting soon...') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(startingSoonPulseAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(startingSoonPulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => {
        pulse.stop();
        startingSoonPulseAnim.setValue(1);
      };
    }
  }, [getUpcomingStatusMessage(), startingSoonPulseAnim]);

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

      {/* Fight Outcome - Show below stars when fight is complete */}
      {fight.isComplete && getOutcomeText() && (
        <View style={styles.outcomeContainer}>
          <Text style={[styles.outcomeText, { color: colors.text }]} numberOfLines={1}>
            {getOutcomeText()}
          </Text>
        </View>
      )}

      {/* Upcoming Fight Status - Show "Up next..." or "Starting soon..." for next fight */}
      {!fight.isComplete && !fight.hasStarted && getUpcomingStatusMessage() && (
        <View style={styles.outcomeContainer}>
          <Animated.Text
            style={[
              styles.outcomeText,
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
  outcomeContainer: {
    marginTop: 8,
  },
  outcomeText: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'left',
  },
});
