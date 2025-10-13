import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image } from 'react-native';
import { FontAwesome, FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { router } from 'expo-router';
import { useAuth } from '../store/AuthContext';

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
  userHypePrediction?: number | null; // For upcoming fights
  isFollowing?: boolean; // Whether user is following this fight
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
  animateRating?: boolean; // Trigger sparkle animation when rating is saved
  animatePrediction?: boolean; // Trigger flame animation when prediction is saved
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
  animateRating = false,
  animatePrediction = false,
}: FightDisplayCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // State to track image loading errors
  const [fighter1ImageError, setFighter1ImageError] = React.useState(false);
  const [fighter2ImageError, setFighter2ImageError] = React.useState(false);

  // Bell notification state
  const [toastMessage, setToastMessage] = useState<string>('');
  const bellRotation = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(50)).current;

  // Rating star press state
  const [isRatingPressed, setIsRatingPressed] = useState(false);

  // Track when "Up next..." first appeared for this fight - use ref to persist across renders
  const upNextStartTimeRef = useRef<number | null>(null);

  // Animated value for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animated value for "Starting soon..." text pulse
  const startingSoonPulseAnim = useRef(new Animated.Value(1)).current;

  // Animated value for background color transition (0 = non-live, 1 = live)
  const bgColorAnim = useRef(new Animated.Value(0)).current;

  // Animated values for rating save animation
  const ratingScaleAnim = useRef(new Animated.Value(1)).current;
  const ratingGlowAnim = useRef(new Animated.Value(0)).current;
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;
  const sparkle4 = useRef(new Animated.Value(0)).current;
  const sparkle5 = useRef(new Animated.Value(0)).current;
  const sparkle6 = useRef(new Animated.Value(0)).current;
  const sparkle7 = useRef(new Animated.Value(0)).current;
  const sparkle8 = useRef(new Animated.Value(0)).current;

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

  // Bell ringing animation (same as fighter follow)
  const animateBellRing = () => {
    bellRotation.setValue(0);
    Animated.sequence([
      Animated.timing(bellRotation, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(bellRotation, {
        toValue: -1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(bellRotation, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(bellRotation, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Toast notification animation
  const showToast = (message: string) => {
    setToastMessage(message);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(50);

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(toastTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: 50,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastMessage('');
      });
    }, 1400);
  };

  // Follow/Unfollow fight mutation
  const followMutation = useMutation({
    mutationFn: async (isCurrentlyFollowing: boolean) => {
      if (isCurrentlyFollowing) {
        return await apiService.unfollowFight(fight.id);
      } else {
        return await apiService.followFight(fight.id);
      }
    },
    onSuccess: async (data) => {
      // Always animate bell
      animateBellRing();

      // Only show toast when following, not when unfollowing
      if (data.isFollowing) {
        showToast('You will be notified right before this fight!');
      }

      // Invalidate all queries that might contain this fight data
      // This is more comprehensive than refetchQueries and catches all contexts
      await queryClient.invalidateQueries({ queryKey: ['fights'] });
      await queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
      await queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      await queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
    },
  });

  const handleBellPress = (e: any) => {
    e.stopPropagation(); // Prevent triggering the card's onPress
    if (!isAuthenticated) {
      return;
    }
    const isCurrentlyFollowing = fight.isFollowing || false;
    followMutation.mutate(isCurrentlyFollowing);
  };

  // Determine fight status
  const status = getStatus();

  // Fetch aggregate prediction stats for upcoming fights
  const { data: predictionStats } = useQuery({
    queryKey: ['fightPredictionStats', fight.id],
    queryFn: () => apiService.getFightPredictionStats(fight.id),
    enabled: status === 'upcoming',
    staleTime: 30 * 1000, // 30 seconds - shorter than FightDisplayCardMinimal for faster updates
  });

  // Fetch aggregate stats for completed fights (reviews, predictions, tags)
  const { data: aggregateStats } = useQuery({
    queryKey: ['fightAggregateStats', fight.id],
    queryFn: () => apiService.getFightAggregateStats(fight.id),
    enabled: status === 'completed',
    staleTime: 60 * 1000, // 60 seconds - data doesn't change as frequently for completed fights
  });

  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  // Determine fight status
  function getStatus() {
    if (fight.isComplete) return 'completed';
    // A fight is "in progress" if it has started (even if we don't know the current round)
    if (fight.hasStarted) return 'in_progress';
    return 'upcoming';
  }

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
      winnerName = fight.fighter1.lastName;
    } else if (fight.winner === fight.fighter2.id) {
      winnerName = fight.fighter2.lastName;
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

    return `${winnerName} by ${fight.method}${roundTimeText}`;
  };

  // Determine which rings to show for each fighter (for completed fights)
  const getFighterRings = (fighterId: string, fighterName: string) => {
    if (status !== 'completed') return [];

    const rings = [];

    // Check if this fighter was the actual winner (green ring - outermost)
    if (fight.winner === fighterId) {
      rings.push('winner');
    }

    // Check if this fighter was the community prediction (yellow ring - middle)
    if (aggregateStats?.communityPrediction?.winner === fighterName) {
      rings.push('community');
    }

    // Check if this fighter was the user's prediction (blue ring - innermost)
    if (aggregateStats?.userPrediction?.winner === fighterName) {
      rings.push('user');
    }

    return rings;
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

  // Helper function to extract last name from full name
  const getLastName = (fullName: string) => {
    if (!fullName) return fullName;
    const parts = fullName.trim().split(' ');
    return parts[parts.length - 1];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatMethod = (method: string | null | undefined) => {
    if (!method) return '';
    if (method === 'KO_TKO') return 'KO/TKO';
    if (method === 'DECISION') return 'Decision';
    if (method === 'SUBMISSION') return 'Submission';
    return method;
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

  // Animate background color transition between live and non-live states
  useEffect(() => {
    const isTrulyLive = fight.hasStarted && !fight.isComplete;
    Animated.timing(bgColorAnim, {
      toValue: isTrulyLive ? 1 : 0,
      duration: 300,
      useNativeDriver: false, // Color animations require native driver to be false
    }).start();
  }, [fight.hasStarted, fight.isComplete, bgColorAnim]);

  // Trigger sparkle animation when rating is saved
  useEffect(() => {
    if (animateRating && fight.userRating) {
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
        // Sparkles
        Animated.timing(sparkle1, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle2, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle3, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle4, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle5, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle6, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle7, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(sparkle8, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animateRating, fight.userRating, ratingScaleAnim, ratingGlowAnim, sparkle1, sparkle2, sparkle3, sparkle4, sparkle5, sparkle6, sparkle7, sparkle8]);

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

      // Scale pop animation with glow and flames
      Animated.parallel([
        // Main scale animation
        Animated.sequence([
          Animated.timing(predictionScaleAnim, {
            toValue: 1.3,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(predictionScaleAnim, {
            toValue: 1,
            friction: 3,
            useNativeDriver: true,
          }),
        ]),
        // Glow effect
        Animated.sequence([
          Animated.timing(predictionGlowAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(predictionGlowAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        // Flames
        Animated.timing(flame1, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(flame2, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(flame3, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(flame4, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(flame5, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(flame6, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(flame7, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(flame8, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animatePrediction, fight.userHypePrediction, predictionScaleAnim, predictionGlowAnim, flame1, flame2, flame3, flame4, flame5, flame6, flame7, flame8]);

  // Interpolate background color for smooth transition
  const animatedBackgroundColor = bgColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.card, colors.primary],
  });

  // Determine text color based on fight status
  const getTextColor = () => {
    return status === 'in_progress' ? colors.textOnAccent : colors.text;
  };

  return (
    <TouchableOpacity
      onPress={() => router.push(`/fight/${fight.id}`)}
      activeOpacity={0.7}
    >
      <Animated.View
        style={[styles.container, { backgroundColor: animatedBackgroundColor }]}
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

      {/* Horizontal Info Row - Fighter Images, Aggregate Rating, My Rating */}
      <View style={styles.horizontalInfoRow}>
        {/* Fighter Headshots */}
        <View style={styles.headshotsContainer}>
          {/* Fighter 1 with layered rings */}
          {(() => {
            const fighter1Name = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
            const fighter1Rings = getFighterRings(fight.fighter1.id, fighter1Name);
            const baseSize = 75;
            const borderWidth = 3;
            const gap = 1;

            return (
              <View style={[styles.fighterHeadshotWrapper, { position: 'relative' }]}>
                {/* Render rings as background layers (from outermost to innermost) */}
                {fighter1Rings.map((ring, index) => {
                  const ringColor = ring === 'winner' ? '#22c55e' : ring === 'community' ? '#F5C518' : '#83B4F3';
                  // Calculate inset for each ring (outermost ring has smallest inset)
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

                {/* Fighter image on top layer */}
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

          {/* Fighter 2 with layered rings */}
          {(() => {
            const fighter2Name = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
            const fighter2Rings = getFighterRings(fight.fighter2.id, fighter2Name);
            const baseSize = 75;
            const borderWidth = 3;
            const gap = 1;

            return (
              <View style={[styles.fighterHeadshotWrapper, { position: 'relative' }]}>
                {/* Render rings as background layers (from outermost to innermost) */}
                {fighter2Rings.map((ring, index) => {
                  const ringColor = ring === 'winner' ? '#22c55e' : ring === 'community' ? '#F5C518' : '#83B4F3';
                  // Calculate inset for each ring (outermost ring has smallest inset)
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

                {/* Fighter image on top layer */}
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

        {/* Ratings Container - wraps both aggregate and user ratings */}
        <View style={styles.ratingsWrapper}>
        {/* Aggregate Score / Live Indicator */}
        <View style={{ width: 100 }}>
        {status === 'upcoming' ? (
          <View style={styles.ratingRow}>
            <FontAwesome6
              name="fire-flame-curved"
              size={20}
              color='#FF6B35'
              style={styles.ratingIcon}
            />
            <Text style={[styles.aggregateLabel, { color: colors.textSecondary }]}>
              {predictionStats?.averageHype !== undefined
                ? (predictionStats.averageHype % 1 === 0 ? predictionStats.averageHype.toString() : predictionStats.averageHype.toFixed(1))
                : '0'
              }
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
            <View style={styles.aggregateRatingContainer}>
              <View style={styles.ratingRow}>
                <FontAwesome
                  name="star"
                  size={30}
                  color="#F5C518"
                  style={styles.ratingIcon}
                />
                <Text style={[styles.aggregateLabel, { color: colors.text }]}>
                  {fight.averageRating % 1 === 0 ? fight.averageRating.toString() : fight.averageRating.toFixed(1)}
                </Text>
              </View>
              <View style={styles.countsColumn}>
                <View style={styles.countRow}>
                  <FontAwesome
                    name="group"
                    size={12}
                    color={colors.textSecondary}
                    style={styles.countIcon}
                  />
                  <Text style={[styles.countText, { color: colors.textSecondary }]}>
                    {aggregateStats?.totalRatings || 0}
                  </Text>
                </View>
                <View style={styles.countRow}>
                  <FontAwesome
                    name="comment-o"
                    size={12}
                    color={colors.textSecondary}
                    style={styles.countIcon}
                  />
                  <Text style={[styles.countText, { color: colors.textSecondary }]}>
                    {aggregateStats?.reviewCount || 0}
                  </Text>
                </View>
              </View>
            </View>
          )
        )}
        </View>

        {/* User's Personal Rating */}
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onPress(fight);
          }}
          onPressIn={() => setIsRatingPressed(true)}
          onPressOut={() => setIsRatingPressed(false)}
          activeOpacity={1}
          style={{
            borderRadius: 20,
            overflow: 'hidden',
          }}
        >
        <View style={{
          position: 'relative',
          backgroundColor: isRatingPressed
            ? (status === 'in_progress' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(131, 180, 243, 0.15)')
            : 'transparent',
          paddingVertical: 8,
          paddingHorizontal: 12,
        }}>
          {/* Sparkles */}
          {fight.userRating && (
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
                <FontAwesome name="star" size={12} color="#F5C518" />
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
                <FontAwesome name="star" size={12} color="#F5C518" />
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
                <FontAwesome name="star" size={12} color="#F5C518" />
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
                <FontAwesome name="star" size={12} color="#F5C518" />
              </Animated.View>

              {/* Top center sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: -10,
                  left: '50%',
                  marginLeft: -6,
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
                <FontAwesome name="star" size={12} color="#F5C518" />
              </Animated.View>

              {/* Right center sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: 2,
                  right: -10,
                  opacity: sparkle6.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { translateY: 0 },
                    { translateX: sparkle6.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                    { scale: sparkle6.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#F5C518" />
              </Animated.View>

              {/* Bottom center sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  bottom: -10,
                  left: '50%',
                  marginLeft: -6,
                  opacity: sparkle7.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: sparkle7.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateY: sparkle7.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#F5C518" />
              </Animated.View>

              {/* Left center sparkle */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: 2,
                  left: -10,
                  opacity: sparkle8.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { translateY: 0 },
                    { translateX: sparkle8.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                    { scale: sparkle8.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                  ],
                }
              ]}>
                <FontAwesome name="star" size={12} color="#F5C518" />
              </Animated.View>
            </>
          )}

          {/* Flame sparkles (for predictions) */}
          {fight.userHypePrediction && (
            <>
              {/* Top-right flame */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: -10,
                  right: -10,
                  opacity: flame1.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: flame1.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateX: flame1.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                    { translateY: flame1.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                  ],
                }
              ]}>
                <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
              </Animated.View>

              {/* Top-left flame */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: -10,
                  left: -10,
                  opacity: flame2.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: flame2.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateX: flame2.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                    { translateY: flame2.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                  ],
                }
              ]}>
                <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
              </Animated.View>

              {/* Bottom-right flame */}
              <Animated.View style={[
                styles.sparkle,
                {
                  bottom: -10,
                  right: -10,
                  opacity: flame3.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: flame3.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateX: flame3.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                    { translateY: flame3.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                  ],
                }
              ]}>
                <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
              </Animated.View>

              {/* Bottom-left flame */}
              <Animated.View style={[
                styles.sparkle,
                {
                  bottom: -10,
                  left: -10,
                  opacity: flame4.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: flame4.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateX: flame4.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                    { translateY: flame4.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                  ],
                }
              ]}>
                <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
              </Animated.View>

              {/* Top center flame */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: -10,
                  left: '50%',
                  marginLeft: -6,
                  opacity: flame5.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: flame5.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateY: flame5.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                  ],
                }
              ]}>
                <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
              </Animated.View>

              {/* Right center flame */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: 2,
                  right: -10,
                  opacity: flame6.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { translateY: 0 },
                    { translateX: flame6.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                    { scale: flame6.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                  ],
                }
              ]}>
                <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
              </Animated.View>

              {/* Bottom center flame */}
              <Animated.View style={[
                styles.sparkle,
                {
                  bottom: -10,
                  left: '50%',
                  marginLeft: -6,
                  opacity: flame7.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { scale: flame7.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                    { translateY: flame7.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                  ],
                }
              ]}>
                <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
              </Animated.View>

              {/* Left center flame */}
              <Animated.View style={[
                styles.sparkle,
                {
                  top: 2,
                  left: -10,
                  opacity: flame8.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    { translateY: 0 },
                    { translateX: flame8.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                    { scale: flame8.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                  ],
                }
              ]}>
                <FontAwesome6 name="fire-flame-curved" size={12} color="#FF6B35" />
              </Animated.View>
            </>
          )}

          {/* Rating glow effect */}
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

          {/* Prediction glow effect */}
          <Animated.View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#FF6B35',
            borderRadius: 20,
            opacity: predictionGlowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.3],
            }),
            transform: [{ scale: predictionGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
          }} />

          <Animated.View style={{
            transform: [{ scale: status === 'upcoming' ? predictionScaleAnim : ratingScaleAnim }],
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
                    {fight.userHypePrediction ? `${fight.userHypePrediction}` : 'Predict'}
                  </Text>
                </>
              ) : status === 'in_progress' ? (
                <>
                  <View style={styles.starWithCommentContainer}>
                    <FontAwesome
                      name={fight.userRating ? "star" : "star-o"}
                      size={30}
                      color={colors.textOnAccent}
                      style={styles.ratingIcon}
                    />
                    {false && fight.userRating && fight.userReview && (
                      <FontAwesome
                        name="comment"
                        size={10}
                        color="#6b7280"
                        style={styles.commentInsideStarIcon}
                      />
                    )}
                  </View>
                  <View style={styles.ratingColumnWrapper}>
                    {fight.userRating ? (
                      <Text style={[styles.userRatingText, { color: colors.textOnAccent }]}>
                        {fight.userRating}
                      </Text>
                    ) : (
                      <Text style={[styles.unratedText, { color: colors.textOnAccent }]}>
                        My{'\n'}Rating
                      </Text>
                    )}
                    {false && fight.userRating && fight.userTags && fight.userTags.length > 0 && (
                      <View style={styles.userTagsColumn}>
                        {fight.userTags.slice(0, 3).map((tag, index) => (
                          <Text key={index} style={[styles.userTagText, { color: '#83B4F3' }]} numberOfLines={1}>
                            #{tag}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.starWithCommentContainer}>
                    <FontAwesome
                      name={fight.userRating ? "star" : "star-o"}
                      size={30}
                      color="#83B4F3"
                      style={styles.ratingIcon}
                    />
                    {false && fight.userRating && fight.userReview && (
                      <FontAwesome
                        name="comment"
                        size={10}
                        color="#6b7280"
                        style={styles.commentInsideStarIcon}
                      />
                    )}
                  </View>
                  <View style={styles.ratingColumnWrapper}>
                    {fight.userRating ? (
                      <Text style={[styles.userRatingText, { color: '#83B4F3' }]}>
                        {fight.userRating}
                      </Text>
                    ) : (
                      <Text style={[styles.unratedText, { color: '#83B4F3' }]}>
                        Rate{'\n'}This
                      </Text>
                    )}
                    {false && fight.userRating && fight.userTags && fight.userTags.length > 0 && (
                      <View style={styles.userTagsColumn}>
                        {fight.userTags.slice(0, 3).map((tag, index) => (
                          <Text key={index} style={[styles.userTagText, { color: '#83B4F3' }]} numberOfLines={1}>
                            #{tag}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              )}
            </View>
          </Animated.View>
        </View>
        </TouchableOpacity>
        </View>
      </View>

      {/* Fight Outcome / Status Container */}
      {fight.isComplete && getOutcomeText() && (
        <View style={styles.outcomeContainer}>
          {/* Pre-Fight Hype */}
          <View style={styles.outcomeLineRow}>
            <View style={styles.iconContainer}>
              <FontAwesome6
                name="fire-flame-curved"
                size={12}
                color="#FF6B35"
              />
            </View>
            <Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>
              How Hyped Was I?
            </Text>
            <View style={styles.hypeScoresRow}>
              {aggregateStats?.userHypeScore ? (
                <Text style={[styles.hypeScoreText, { color: colors.text }]}>
                  {aggregateStats.userHypeScore}
                </Text>
              ) : (
                <Text style={[styles.hypeScoreText, { color: colors.textSecondary }]}>N/A</Text>
              )}
              {aggregateStats?.communityAverageHype && (
                <>
                  <Text style={[styles.communityLabel, { color: colors.textSecondary }]}>
                    Community:
                  </Text>
                  <Text style={[styles.hypeScoreText, { color: colors.text }]}>
                    {aggregateStats.communityAverageHype}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* My Prediction */}
          {aggregateStats?.userPrediction ? (
            <View style={styles.outcomeLineRow}>
              <View style={styles.iconContainer}>
                <FontAwesome
                  name="eye"
                  size={12}
                  color="#83B4F3"
                />
              </View>
              <Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>
                My Prediction:
              </Text>
              <Text style={[styles.outcomeLineText, { color: colors.text }]} numberOfLines={1}>
                {getLastName(aggregateStats.userPrediction.winner) || 'N/A'}
                {aggregateStats.userPrediction.method && ` by ${formatMethod(aggregateStats.userPrediction.method)}`}
                {aggregateStats.userPrediction.round && ` R${aggregateStats.userPrediction.round}`}
              </Text>
            </View>
          ) : (
            <View style={styles.outcomeLineRow}>
              <View style={styles.iconContainer}>
                <FontAwesome
                  name="eye"
                  size={12}
                  color="#83B4F3"
                />
              </View>
              <Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>
                My Prediction:
              </Text>
              <Text style={[styles.outcomeLineText, { color: colors.textSecondary }]}>
                N/A
              </Text>
            </View>
          )}

          {/* Community Prediction */}
          {aggregateStats?.communityPrediction?.winner ? (
            <View style={styles.outcomeLineRow}>
              <View style={styles.iconContainer}>
                <FontAwesome
                  name="bar-chart"
                  size={12}
                  color="#F5C518"
                />
              </View>
              <Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>
                Community Prediction:
              </Text>
              <Text style={[styles.outcomeLineText, { color: colors.text }]} numberOfLines={1}>
                {getLastName(aggregateStats.communityPrediction.winner)}
                {aggregateStats.communityPrediction.method && ` by ${formatMethod(aggregateStats.communityPrediction.method)}`}
                {aggregateStats.communityPrediction.round && ` R${aggregateStats.communityPrediction.round}`}
              </Text>
            </View>
          ) : (
            <View style={styles.outcomeLineRow}>
              <View style={styles.iconContainer}>
                <FontAwesome
                  name="bar-chart"
                  size={12}
                  color="#F5C518"
                />
              </View>
              <Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>
                Community Prediction:
              </Text>
              <Text style={[styles.outcomeLineText, { color: colors.textSecondary }]}>
                N/A
              </Text>
            </View>
          )}

          {/* Outcome and tags */}
          <View style={styles.outcomeWithTagsContainer}>
            <View style={styles.outcomeLineRow}>
              <View style={styles.iconContainer}>
                <FontAwesome
                  name="trophy"
                  size={12}
                  color="#22c55e"
                />
              </View>
              <Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>
                Outcome:
              </Text>
              {fight.userRating ? (
                <Text style={[styles.outcomeLineText, { color: colors.text }]} numberOfLines={1}>
                  {getOutcomeText()}
                </Text>
              ) : (
                <Text style={[styles.outcomeLineText, { color: colors.textSecondary, fontStyle: 'italic' }]} numberOfLines={1}>
                  Rate this to show winner.
                </Text>
              )}
            </View>
            {/* Tags inline with outcome - only show when user has rated */}
            {fight.userRating && aggregateStats?.topTags && aggregateStats.topTags.length > 0 && (
              <View style={styles.tagsInlineContainer}>
                <View style={styles.iconContainer}>
                  <FontAwesome
                    name="hashtag"
                    size={11}
                    color="#F5C518"
                  />
                </View>
                {aggregateStats.topTags.slice(0, 3).map((tag, index) => (
                  <Text key={index} style={[styles.tagText, { color: colors.textSecondary }]}>
                    #{tag.name}{index < 2 ? ' ' : ''}
                  </Text>
                ))}
              </View>
            )}
          </View>
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

      {/* Empty outcome container for upcoming/live fights without status messages */}
      {!fight.isComplete && !getUpcomingStatusMessage() && (
        <View style={styles.outcomeContainer}>
          <Text style={[styles.outcomeText, { color: 'transparent' }]} numberOfLines={1}>
            {' '}
          </Text>
        </View>
      )}

      {/* Bell icon for fight notifications - Top right (only for upcoming fights) */}
      {isAuthenticated && status === 'upcoming' && (
        <TouchableOpacity
          style={styles.bellButton}
          onPress={handleBellPress}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: bellRotation.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ['-15deg', '0deg', '15deg'],
                  }),
                },
              ],
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
      </Animated.View>
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
  fighterHeadshotWrapper: {
    position: 'relative',
    width: 75,
    height: 75,
    borderRadius: 37.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fighterHeadshot: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
  },
  fighterHeadshotWithRing: {
    width: 69,
    height: 69,
    borderRadius: 34.5,
  },
  predictedWinnerRing: {
    borderWidth: 3,
    borderColor: '#83B4F3',
    padding: 0,
  },
  horizontalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 16,
  },
  ratingsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginRight: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ratingIcon: {
    width: 36,
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
    fontSize: 28,
    fontWeight: '500',
  },
  starWithCommentContainer: {
    position: 'relative',
    width: 36,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentInsideStarIcon: {
    position: 'absolute',
    top: 10,
    left: 13,
  },
  ratingColumnWrapper: {
    position: 'relative',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  userRatingColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
  },
  ratingWithCommentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  commentBubbleIcon: {
    marginBottom: 2,
  },
  userTagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
  },
  userTagsColumn: {
    position: 'absolute',
    top: 36,
    left: -42,
    width: 120,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 1,
  },
  userTagText: {
    fontSize: 9,
    fontWeight: '500',
  },
  unratedText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
  },
  aggregateLabel: {
    fontSize: 28,
    fontWeight: '500',
  },
  aggregateRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countsColumn: {
    flexDirection: 'column',
    gap: 2,
    marginTop: 5,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countIcon: {
    width: 12,
    textAlign: 'center',
  },
  countText: {
    fontSize: 11,
    fontWeight: '400',
  },
  commentIcon: {
    marginLeft: 12,
    marginRight: 4,
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
    marginTop: 13,
    gap: 4,
  },
  outcomeText: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'left',
  },
  outcomeLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  outcomeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  outcomeLineText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  outcomeWithTagsContainer: {
    gap: 4,
  },
  tagsInlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    overflow: 'hidden',
  },
  iconContainer: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  sparkle: {
    position: 'absolute',
    zIndex: 10,
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
  completedStatsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  moreTagsText: {
    fontSize: 11,
    fontWeight: '500',
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  predictionLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  predictionValue: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  hypeScoresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  hypeScoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hypeScoreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  communityLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});
