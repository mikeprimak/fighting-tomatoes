import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  useColorScheme,
  Animated,
  Easing,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { getHypeHeatmapColor } from '../utils/heatmap';
import PredictionBarChart from './PredictionBarChart';
import FightDetailsSection from './FightDetailsSection';
import { useFightStats } from '../hooks/useFightStats';
import { PreFightCommentCard } from './PreFightCommentCard';
import { useAuth } from '../store/AuthContext';
import { FlagReviewModal } from '.';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from './CustomAlert';
import FightDetailsMenu from './FightDetailsMenu';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  profileImage?: string | null;
  wins: number;
  losses: number;
  draws: number;
}

interface Event {
  id: string;
  name: string;
  date: string;
  location?: string | null;
  venue?: string | null;
  mainStartTime?: string | null;
  prelimStartTime?: string | null;
  earlyPrelimStartTime?: string | null;
}

interface Fight {
  id: string;
  fighter1: Fighter;
  fighter2: Fighter;
  fighter1Odds?: string | null;
  fighter2Odds?: string | null;
  fighter1Ranking?: number | null;
  fighter2Ranking?: number | null;
  weightClass?: string | null;
  isTitle: boolean;
  event: Event;
  hasStarted: boolean;
  isComplete: boolean;
  userPredictedWinner?: string | null;
  userPredictedMethod?: string | null;
  userPredictedRound?: number | null;
  userHypePrediction?: number | null;
  isFollowing?: boolean;
}

interface UpcomingFightDetailScreenProps {
  fight: Fight;
  onPredictionSuccess?: () => void;
}

// Placeholder image for fighters
const getFighterPlaceholderImage = (fighterId: string) => {
  return require('../assets/fighters/fighter-default-alpha.png');
};

// Heatmap flame icon color - solid colors for icon display
export default function UpcomingFightDetailScreen({ fight, onPredictionSuccess }: UpcomingFightDetailScreenProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();

  // Local state for selections (will be saved immediately on change)
  const [selectedWinner, setSelectedWinner] = useState<string | null>(fight.userPredictedWinner || null);
  const [selectedHype, setSelectedHype] = useState<number | null>(fight.userHypePrediction || null);
  const [selectedMethod, setSelectedMethod] = useState<'KO_TKO' | 'SUBMISSION' | 'DECISION' | null>(
    (fight.userPredictedMethod as 'KO_TKO' | 'SUBMISSION' | 'DECISION') || null
  );

  // Pre-flight comment state
  const [preFightComment, setPreFightComment] = useState<string>('');
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [commentToFlag, setCommentToFlag] = useState<string | null>(null);
  const [detailsMenuVisible, setDetailsMenuVisible] = useState(false);
  const [isFollowing, setIsFollowing] = useState(fight.isFollowing ?? false);
  const scrollViewRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<View>(null);

  // Wheel animation for number display
  const wheelAnimation = useRef(new Animated.Value(fight.userHypePrediction ? (10 - fight.userHypePrediction) * 120 : 1200)).current;

  // Fetch both prediction stats and aggregate stats in a single API call
  const { data: fightStatsData } = useQuery({
    queryKey: ['fightStats', fight.id],
    queryFn: async () => {
      const [predictionStats, aggregateStats] = await Promise.all([
        apiService.getFightPredictionStats(fight.id),
        apiService.getFightAggregateStats(fight.id),
      ]);
      return { predictionStats, aggregateStats };
    },
    enabled: !!fight.id,
    staleTime: 60 * 1000,
    refetchOnMount: 'always',
  });

  const predictionStats = fightStatsData?.predictionStats;
  const aggregateStats = fightStatsData?.aggregateStats;

  // Fetch pre-fight comments
  const { data: preFightCommentsData } = useQuery({
    queryKey: ['preFightComments', fight.id],
    queryFn: () => apiService.getPreFightComments(fight.id),
    enabled: !!fight.id,
    staleTime: 30 * 1000,
  });

  // Set initial comment from user's existing comment
  useEffect(() => {
    if (preFightCommentsData?.userComment?.content) {
      setPreFightComment(preFightCommentsData.userComment.content);
    }
  }, [preFightCommentsData?.userComment?.content]);

  // HARDCODED TEST DATA - Remove this when done testing
  const testPredictionStats = {
    totalPredictions: 100,
    averageHype: 8.5,
    winnerPredictions: {
      fighter1: { id: fight.fighter1.id, name: `${fight.fighter1.firstName} ${fight.fighter1.lastName}`, predictions: 55, percentage: 55 },
      fighter2: { id: fight.fighter2.id, name: `${fight.fighter2.firstName} ${fight.fighter2.lastName}`, predictions: 45, percentage: 45 },
    },
    methodPredictions: {
      DECISION: 30,
      KO_TKO: 45,
      SUBMISSION: 25,
    },
    roundPredictions: {},
    fighter1MethodPredictions: {
      DECISION: 15,
      KO_TKO: 30,
      SUBMISSION: 10,
    },
    fighter1RoundPredictions: {},
    fighter2MethodPredictions: {
      DECISION: 15,
      KO_TKO: 15,
      SUBMISSION: 15,
    },
    fighter2RoundPredictions: {},
  };

  // Override with test data
  const displayPredictionStats = testPredictionStats;

  // Auto-save winner selection
  const saveWinnerMutation = useMutation({
    mutationFn: async (winnerId: string | null) => {
      return apiService.createFightPrediction(fight.id, {
        predictedWinner: winnerId || undefined,
        // Keep existing values
        predictedMethod: fight.userPredictedMethod as 'DECISION' | 'KO_TKO' | 'SUBMISSION' | undefined,
        predictedRound: fight.userPredictedRound || undefined,
        predictedRating: selectedHype || undefined,
      });
    },
    onSuccess: () => {
      // Invalidate fight-specific queries
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightPredictionStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightAggregateStats', fight.id] });

      // Invalidate list queries that show this fight
      queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
      queryClient.invalidateQueries({ queryKey: ['topRecentFights'] });
      queryClient.invalidateQueries({ queryKey: ['hotPredictions'] });
      queryClient.invalidateQueries({ queryKey: ['evenPredictions'] });
      queryClient.invalidateQueries({ queryKey: ['fighterFights'] });

      onPredictionSuccess?.();
    },
  });

  // Auto-save hype selection
  const saveHypeMutation = useMutation({
    mutationFn: async (hypeLevel: number | null) => {
      return apiService.createFightPrediction(fight.id, {
        predictedRating: hypeLevel || undefined,
        // Keep existing values
        predictedWinner: selectedWinner || undefined,
        predictedMethod: selectedMethod || undefined,
        predictedRound: fight.userPredictedRound || undefined,
      });
    },
    onSuccess: () => {
      // Invalidate fight-specific queries
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightPredictionStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightAggregateStats', fight.id] });

      // Invalidate list queries that show this fight
      queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
      queryClient.invalidateQueries({ queryKey: ['topRecentFights'] });
      queryClient.invalidateQueries({ queryKey: ['hotPredictions'] });
      queryClient.invalidateQueries({ queryKey: ['evenPredictions'] });
      queryClient.invalidateQueries({ queryKey: ['fighterFights'] });

      onPredictionSuccess?.();
    },
  });

  // Auto-save method selection
  const saveMethodMutation = useMutation({
    mutationFn: async (method: 'KO_TKO' | 'SUBMISSION' | 'DECISION' | null) => {
      return apiService.createFightPrediction(fight.id, {
        predictedMethod: method || undefined,
        // Keep existing values
        predictedWinner: selectedWinner || undefined,
        predictedRating: selectedHype || undefined,
        predictedRound: fight.userPredictedRound || undefined,
      });
    },
    onSuccess: () => {
      // Invalidate fight-specific queries
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightPredictionStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightAggregateStats', fight.id] });

      // Invalidate list queries that show this fight
      queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
      queryClient.invalidateQueries({ queryKey: ['topRecentFights'] });
      queryClient.invalidateQueries({ queryKey: ['hotPredictions'] });
      queryClient.invalidateQueries({ queryKey: ['evenPredictions'] });
      queryClient.invalidateQueries({ queryKey: ['fighterFights'] });

      onPredictionSuccess?.();
    },
  });

  // Save pre-fight comment
  const saveCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiService.createPreFightComment(fight.id, content);
    },
    onSuccess: () => {
      // Invalidate pre-flight comments query to refresh the comment list
      queryClient.invalidateQueries({ queryKey: ['preFightComments', fight.id] });
      // Exit edit mode after successful save
      setIsEditingComment(false);
    },
  });

  // Manual save handler for comment
  const handleSaveComment = () => {
    saveCommentMutation.mutate(preFightComment.trim());
  };

  // Flag comment mutation
  const flagCommentMutation = useMutation({
    mutationFn: async ({ commentId, reason }: { commentId: string; reason: string }) => {
      return apiService.flagPreFightComment(fight.id, commentId, reason);
    },
    onSuccess: () => {
      showSuccess('Comment has been flagged for moderation');
      setFlagModalVisible(false);
      setCommentToFlag(null);
    },
    onError: (error: any) => {
      showError(error?.error || 'Failed to flag comment');
    },
  });

  const handleFlagComment = (commentId: string) => {
    setCommentToFlag(commentId);
    setFlagModalVisible(true);
  };

  const submitFlagComment = (reason: string) => {
    if (commentToFlag) {
      flagCommentMutation.mutate({ commentId: commentToFlag, reason });
    }
  };

  // Toggle fight notification mutation
  const toggleNotificationMutation = useMutation({
    mutationFn: async (shouldFollow: boolean) => {
      if (shouldFollow) {
        return apiService.followFight(fight.id);
      } else {
        return apiService.unfollowFight(fight.id);
      }
    },
    onSuccess: (data) => {
      setIsFollowing(data.isFollowing);
      showSuccess(data.message);
      // Invalidate fight query to refresh isFollowing status
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
    },
    onError: (error: any) => {
      showError(error?.error || 'Failed to update notification preference');
    },
  });

  const handleToggleNotification = (enabled: boolean) => {
    toggleNotificationMutation.mutate(enabled);
  };

  // Animated wheel effect for number display
  const animateToNumber = (targetNumber: number) => {
    const currentNumber = selectedHype || 0;
    if (currentNumber === targetNumber) return;

    // Stop any existing animation to prevent conflicts
    wheelAnimation.stopAnimation();

    // Calculate target position
    // Numbers are arranged 10,9,8,7,6,5,4,3,2,1 (10 at top, 1 at bottom)
    // Position 0 = number 10, position 120 = number 9, ... position 1080 = number 1
    // Position 1200 = blank (below "1")
    const targetPosition = targetNumber === 0 ? 1200 : (10 - targetNumber) * 120;

    // Simple, smooth animation
    Animated.timing(wheelAnimation, {
      toValue: targetPosition,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handleWinnerSelection = (fighterId: string) => {
    const newWinner = selectedWinner === fighterId ? null : fighterId;
    setSelectedWinner(newWinner);
    saveWinnerMutation.mutate(newWinner);
  };

  const handleHypeSelection = (level: number) => {
    // If tapping the same level, deselect (set to null)
    const newHype = selectedHype === level ? null : level;
    setSelectedHype(newHype);
    animateToNumber(newHype || 0);
    saveHypeMutation.mutate(newHype);
  };

  const handleMethodSelection = (method: 'KO_TKO' | 'SUBMISSION' | 'DECISION') => {
    // If tapping the same method, deselect (set to null)
    const newMethod = selectedMethod === method ? null : method;
    setSelectedMethod(newMethod);
    saveMethodMutation.mutate(newMethod);
  };

  // Helper function to format weight class
  const formatWeightClass = (weightClass: string) => {
    return weightClass
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Handle keyboard show to scroll to input
  const handleCommentFocus = () => {
    setIsCommentFocused(true);
    setTimeout(() => {
      commentInputRef.current?.measureLayout(
        scrollViewRef.current as any,
        (x, y) => {
          scrollViewRef.current?.scrollTo({
            y: y - 100,
            animated: true,
          });
        },
        () => {}
      );
    }, 100);
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[styles.scrollView, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
    >


      {/* Who Do You Think Will Win? */}
      <View style={styles.sectionNoBorder}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Who do you think will win?
          </Text>
          <TouchableOpacity
            onPress={() => setDetailsMenuVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome name="ellipsis-v" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.fighterButtons}>
          <TouchableOpacity
            style={[
              styles.fighterButton,
              {
                backgroundColor: selectedWinner === fight.fighter1.id ? '#F5C518' : colors.background,
                borderColor: colors.border,
              }
            ]}
            onPress={() => handleWinnerSelection(fight.fighter1.id)}
          >
            <Image
              source={
                fight.fighter1.profileImage
                  ? { uri: fight.fighter1.profileImage }
                  : getFighterPlaceholderImage(fight.fighter1.id)
              }
              style={styles.fighterButtonImage}
            />
            <Text style={[
              styles.fighterButtonText,
              {
                color: selectedWinner === fight.fighter1.id ? '#000' : colors.text
              }
            ]}>
              {fight.fighter1.lastName}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.fighterButton,
              {
                backgroundColor: selectedWinner === fight.fighter2.id ? '#F5C518' : colors.background,
                borderColor: colors.border,
              }
            ]}
            onPress={() => handleWinnerSelection(fight.fighter2.id)}
          >
            <Image
              source={
                fight.fighter2.profileImage
                  ? { uri: fight.fighter2.profileImage }
                  : getFighterPlaceholderImage(fight.fighter2.id)
              }
              style={styles.fighterButtonImage}
            />
            <Text style={[
              styles.fighterButtonText,
              {
                color: selectedWinner === fight.fighter2.id ? '#000' : colors.text
              }
            ]}>
              {fight.fighter2.lastName}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* How will it end? */}
      <View style={[styles.sectionNoBorder, { marginTop: -28 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          How will it end?
        </Text>
        <View style={styles.methodButtons}>
          {(['KO_TKO', 'SUBMISSION', 'DECISION'] as const).map((method) => {
            return (
              <TouchableOpacity
                key={method}
                style={[
                  styles.methodButton,
                  {
                    backgroundColor: selectedMethod === method ? '#F5C518' : colors.background,
                    borderColor: colors.border,
                  }
                ]}
                onPress={() => handleMethodSelection(method)}
              >
                <Text style={[
                  styles.methodButtonText,
                  {
                    color: selectedMethod === method ? '#000' : colors.text
                  }
                ]}>
                  {method === 'KO_TKO' ? 'KO/TKO' : method}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* How Hyped Are You? */}
      <View style={[styles.sectionNoBorder, { marginTop: -25 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, zIndex: 10 }]}>
          How hyped are you?
        </Text>

        {/* Large display flame with wheel animation */}
        <View style={styles.displayFlameContainer}>
          <View style={styles.animatedFlameContainer}>
            <View style={{ position: 'relative' }}>
              {/* Flame icon changes based on selected hype level */}
              <FontAwesome6
                name="fire-flame-curved"
                size={80}
                color={selectedHype && selectedHype > 0 ? getHypeHeatmapColor(selectedHype) : '#808080'}
              />
            </View>
            <View style={styles.wheelContainer}>
              <Animated.View style={[
                styles.wheelNumbers,
                {
                  transform: [{
                    translateY: wheelAnimation.interpolate({
                      inputRange: [0, 1200],
                      outputRange: [475, -725],
                    })
                  }]
                }
              ]}>
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((number) => (
                  <Text key={number} style={[styles.wheelNumber, { color: colors.text }]}>
                    {number}
                  </Text>
                ))}
              </Animated.View>

              {/* Smooth top gradient fade */}
              <LinearGradient
                colors={[colors.background, `${colors.background}DD`, `${colors.background}99`, `${colors.background}44`, 'transparent']}
                style={[styles.fadeOverlay, { top: -8, height: 38 }]}
                pointerEvents="none"
              />

              {/* Smooth bottom gradient fade */}
              <LinearGradient
                colors={['transparent', `${colors.background}44`, `${colors.background}99`, `${colors.background}DD`, colors.background, colors.background]}
                style={[styles.fadeOverlay, { bottom: -6, height: 31 }]}
                pointerEvents="none"
              />
            </View>
          </View>
        </View>

        {/* Row of selectable flames (1-10) */}
        <View style={styles.flameContainer}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
            const isSelected = level <= (selectedHype || 0);
            const flameColor = isSelected ? getHypeHeatmapColor(level) : '#808080';

            return (
              <TouchableOpacity
                key={level}
                onPress={() => handleHypeSelection(level)}
                style={styles.flameButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <FontAwesome6
                  name="fire-flame-curved"
                  size={32}
                  color={flameColor}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Pre-Fight Comments */}
      <View style={[styles.sectionNoBorder, { marginTop: -25 }]}>
        {/* Title row with Add Comment / Cancel button */}
        <View style={styles.commentHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
            Pre-Fight Comments
          </Text>
          {!preFightCommentsData?.userComment && !isEditingComment && (
            <TouchableOpacity
              onPress={() => setShowCommentForm(!showCommentForm)}
              style={styles.addCommentButton}
            >
              <Text style={[styles.addCommentButtonText, { color: colors.tint }]}>
                {showCommentForm ? 'Cancel' : 'Add Comment'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Show comment input when showCommentForm is true (for new comments) OR when editing */}
        {((showCommentForm && !preFightCommentsData?.userComment) || isEditingComment) && (
          <View ref={commentInputRef} collapsable={false} style={{ marginTop: 16 }}>
            <View style={[
              styles.commentInputContainer,
              {
                backgroundColor: colors.card,
                borderColor: isCommentFocused ? colors.tint : colors.border,
              }
            ]}>
              <TextInput
                style={[
                  styles.commentInput,
                  { color: colors.text }
                ]}
                placeholder="Share why you're hyped for this fight..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                maxLength={500}
                value={preFightComment}
                onChangeText={setPreFightComment}
                onFocus={handleCommentFocus}
                onBlur={() => setIsCommentFocused(false)}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.saveCommentButton,
                {
                  backgroundColor: (preFightCommentsData?.userComment || preFightComment.trim().length > 0) ? colors.tint : colors.card,
                }
              ]}
              disabled={saveCommentMutation.isPending}
              onPress={handleSaveComment}
            >
              <Text style={[
                styles.saveCommentButtonText,
                { color: (preFightCommentsData?.userComment || preFightComment.trim().length > 0) ? '#000' : colors.text }
              ]}>
                {saveCommentMutation.isPending ? 'Saving...' : 'Save Comment'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Display All Pre-Fight Comments */}
        {preFightCommentsData && preFightCommentsData.comments && preFightCommentsData.comments.length > 0 && (
          <View style={{ marginTop: 16 }}>

          {/* User's own comment first (if exists and not editing) */}
          {preFightCommentsData.userComment && !isEditingComment && (
            <PreFightCommentCard
              comment={{
                id: preFightCommentsData.userComment.id,
                content: preFightCommentsData.userComment.content,
                hypeRating: selectedHype,
                upvotes: preFightCommentsData.userComment.upvotes || 0,
                userHasUpvoted: false, // User can't upvote their own comment
                user: {
                  displayName: preFightCommentsData.userComment.user.displayName,
                },
              }}
              onEdit={() => setIsEditingComment(true)}
              isAuthenticated={isAuthenticated}
              showMyComment={true}
            />
          )}

          {/* All other comments */}
          {preFightCommentsData.comments
            .filter((c: any) => c.id !== preFightCommentsData.userComment?.id)
            .map((comment: any) => (
              <PreFightCommentCard
                key={comment.id}
                comment={{
                  id: comment.id,
                  content: comment.content,
                  hypeRating: comment.hypeRating,
                  upvotes: comment.upvotes || 0,
                  userHasUpvoted: comment.userHasUpvoted || false,
                  user: {
                    displayName: comment.user.displayName,
                  },
                }}
                onFlag={() => handleFlagComment(comment.id)}
                isAuthenticated={isAuthenticated}
                showMyComment={false}
              />
            ))}
          </View>
        )}
      </View>

      {/* All Predictions */}
      <View style={styles.sectionNoBorder}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          All Predictions
        </Text>

        {/* Prediction Breakdown Chart */}
        <PredictionBarChart
          predictionStats={displayPredictionStats}
          fighter1Name={fight.fighter1.lastName}
          fighter2Name={fight.fighter2.lastName}
        />
      </View>

      {/* Flag Comment Modal */}
      <FlagReviewModal
        visible={flagModalVisible}
        onClose={() => {
          setFlagModalVisible(false);
          setCommentToFlag(null);
        }}
        onSubmit={submitFlagComment}
        isSubmitting={flagCommentMutation.isPending}
        colorScheme={colorScheme ?? 'light'}
      />

      {/* Custom Alert */}
      <CustomAlert {...alertState} onDismiss={hideAlert} />

      {/* Fight Details Menu */}
      <FightDetailsMenu
        fight={fight}
        visible={detailsMenuVisible}
        onClose={() => setDetailsMenuVisible(false)}
        isFollowing={isFollowing}
        onToggleNotification={handleToggleNotification}
        isTogglingNotification={toggleNotificationMutation.isPending}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  section: {
    marginHorizontal: 4,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionNoBorder: {
    marginHorizontal: 4,
    marginBottom: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  fighterButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  fighterButton: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  fighterButtonImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  fighterButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  displayFlameContainer: {
    alignItems: 'center',
    marginBottom: 1,
    marginTop: -23,
    paddingBottom: 10,
  },
  animatedFlameContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  wheelContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  wheelNumbers: {
    alignItems: 'center',
    paddingTop: 150,
  },
  wheelNumber: {
    fontSize: 52,
    fontWeight: 'bold',
    height: 120,
    textAlign: 'center',
    lineHeight: 120,
  },
  fadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  flameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: -15,
  },
  flameButton: {
    padding: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  methodButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  methodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    marginLeft: 12,
    flex: 1,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  addCommentButton: {
    padding: 8,
  },
  addCommentButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  commentInputContainer: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
  },
  commentInput: {
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  saveCommentButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  saveCommentButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
