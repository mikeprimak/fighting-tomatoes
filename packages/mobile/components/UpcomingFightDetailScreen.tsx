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
import { FontAwesome, FontAwesome6, Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { getHypeHeatmapColor } from '../utils/heatmap';
import PredictionBarChart from './PredictionBarChart';
import FightDetailsSection from './FightDetailsSection';
import { useFightStats } from '../hooks/useFightStats';
import { PreFightCommentCard } from './PreFightCommentCard';
import { useAuth } from '../store/AuthContext';
import { usePredictionAnimation } from '../store/PredictionAnimationContext';
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
  fighter1Id: string;
  fighter2Id: string;
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
  isFollowingFighter1?: boolean;
  isFollowingFighter2?: boolean;
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
  const { setPendingAnimation } = usePredictionAnimation();
  const { alertState, showSuccess, showError, showConfirm, hideAlert } = useCustomAlert();

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
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);
  const [detailsMenuVisible, setDetailsMenuVisible] = useState(false);
  const [isFollowing, setIsFollowing] = useState(fight.isFollowing ?? false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [localFighter1Notification, setLocalFighter1Notification] = useState(fight.isFollowingFighter1);
  const [localFighter2Notification, setLocalFighter2Notification] = useState(fight.isFollowingFighter2);
  const [localNotificationReasons, setLocalNotificationReasons] = useState(fight.notificationReasons);

  // Snapshot the fight data when menu opens to prevent re-renders during toggles
  const [menuFightSnapshot, setMenuFightSnapshot] = useState(fight);
  const scrollViewRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<View>(null);

  // Animation for toast notification
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(50)).current;

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
    queryFn: () => apiService.getFightPreFightComments(fight.id),
    enabled: !!fight.id,
    staleTime: 30 * 1000,
  });

  // Set initial comment from user's existing comment
  useEffect(() => {
    if (preFightCommentsData?.userComment?.content) {
      setPreFightComment(preFightCommentsData.userComment.content);
    }
  }, [preFightCommentsData?.userComment?.content]);

  // Update local state when fight prop changes (e.g., after navigating back from fighter screen)
  useEffect(() => {
    setIsFollowing(fight.isFollowing ?? false);
    setLocalFighter1Notification(fight.isFollowingFighter1);
    setLocalFighter2Notification(fight.isFollowingFighter2);
    setLocalNotificationReasons(fight.notificationReasons);
  }, [fight.isFollowing, fight.isFollowingFighter1, fight.isFollowingFighter2, fight.notificationReasons]);

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
        predictedMethod: selectedMethod || undefined,
        predictedRound: fight.userPredictedRound || undefined,
        predictedRating: selectedHype || undefined,
      });
    },
    onSuccess: () => {
      // Mark this fight as needing animation
      setPendingAnimation(fight.id);

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
      // Mark this fight as needing animation
      setPendingAnimation(fight.id);

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
      // Mark this fight as needing animation
      setPendingAnimation(fight.id);

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
  const handleSaveComment = async () => {
    // Check if user is trying to delete an existing comment
    const isDeletingComment = preFightCommentsData?.userComment && !preFightComment.trim();

    // Confirm deletion if user is removing their existing comment
    if (isDeletingComment) {
      showConfirm(
        'Are you sure you want to delete your comment?',
        () => {
          // User confirmed deletion - save empty string to delete
          saveCommentMutation.mutate('');
          setIsEditingComment(false);
          setShowCommentForm(false);
        },
        'Delete Comment',
        'Delete',
        'Cancel',
        true // destructive style
      );
      return;
    }

    // If adding a new comment but no text entered, just close the form
    if (!preFightCommentsData?.userComment && !preFightComment.trim()) {
      setShowCommentForm(false);
      return;
    }

    // Check if this is a new comment (not editing existing)
    const isNewComment = !preFightCommentsData?.userComment && preFightComment.trim();

    try {
      // Save the comment - this returns the created/updated comment
      const response = await saveCommentMutation.mutateAsync(preFightComment.trim());

      // Invalidate queries to refresh the comment list
      await queryClient.invalidateQueries({ queryKey: ['preFightComments', fight.id] });

      // If it's a new comment, auto-upvote it
      if (isNewComment && response?.comment?.id) {
        const commentId = response.comment.id;
        // Auto-upvote the newly created comment
        await upvotePreFightCommentMutation.mutateAsync(commentId);
      }

      // Exit edit mode and hide form after successful save
      setIsEditingComment(false);
      setShowCommentForm(false);
    } catch (error) {
      console.error('Failed to save comment:', error);
    }
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

  // Upvote pre-fight comment mutation
  const upvotePreFightCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return apiService.togglePreFightCommentUpvote(fight.id, commentId);
    },
    onMutate: async (commentId) => {
      setUpvotingCommentId(commentId);

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['preFightComments', fight.id] });
      const previousComments = queryClient.getQueryData(['preFightComments', fight.id]);

      // Optimistic update
      queryClient.setQueryData(['preFightComments', fight.id], (old: any) => {
        if (!old) return old;

        // Update user comment if it's the one being upvoted
        const updatedUserComment = old.userComment?.id === commentId
          ? {
              ...old.userComment,
              userHasUpvoted: !old.userComment.userHasUpvoted,
              upvotes: old.userComment.userHasUpvoted
                ? old.userComment.upvotes - 1
                : old.userComment.upvotes + 1,
            }
          : old.userComment;

        // Update comments array
        const updatedComments = old.comments.map((comment: any) =>
          comment.id === commentId
            ? {
                ...comment,
                userHasUpvoted: !comment.userHasUpvoted,
                upvotes: comment.userHasUpvoted ? comment.upvotes - 1 : comment.upvotes + 1,
              }
            : comment
        );

        return {
          ...old,
          userComment: updatedUserComment,
          comments: updatedComments,
        };
      });

      return { previousComments };
    },
    onSuccess: (data, commentId) => {
      // Update with actual server response
      queryClient.setQueryData(['preFightComments', fight.id], (old: any) => {
        if (!old) return old;

        const updatedUserComment = old.userComment?.id === commentId
          ? {
              ...old.userComment,
              userHasUpvoted: data.userHasUpvoted,
              upvotes: data.upvotes,
            }
          : old.userComment;

        const updatedComments = old.comments.map((comment: any) =>
          comment.id === commentId
            ? {
                ...comment,
                userHasUpvoted: data.userHasUpvoted,
                upvotes: data.upvotes,
              }
            : comment
        );

        return {
          ...old,
          userComment: updatedUserComment,
          comments: updatedComments,
        };
      });
    },
    onError: (err: any, commentId, context: any) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(['preFightComments', fight.id], context.previousComments);
      }
    },
    onSettled: () => {
      setUpvotingCommentId(null);
    },
  });

  const handleUpvoteComment = (commentId: string) => {
    upvotePreFightCommentMutation.mutate(commentId);
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

    // Auto-dismiss after 2 seconds
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
    }, 2000);
  };

  // Toggle fight notification mutation
  const toggleNotificationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiService.toggleFightNotification(fight.id, enabled);
    },
    onMutate: async (enabled) => {
      // Optimistically update local state
      if (enabled) {
        // When enabling, create a "manual" notification reason
        setLocalNotificationReasons({
          willBeNotified: true,
          reasons: [
            ...(localNotificationReasons?.reasons || []).filter(r => r.isActive),
            {
              type: 'manual' as const,
              source: 'Manual Fight Follow',
              isActive: true,
            },
          ],
        });
      } else {
        // When disabling, mark all reasons as inactive
        setLocalNotificationReasons({
          willBeNotified: false,
          reasons: (localNotificationReasons?.reasons || []).map(r => ({
            ...r,
            isActive: false,
          })),
        });
      }
      // Update the menu snapshot
      setMenuFightSnapshot(prev => ({
        ...prev,
        notificationReasons: enabled
          ? {
              willBeNotified: true,
              reasons: [
                ...(prev.notificationReasons?.reasons || []).filter(r => r.isActive),
                {
                  type: 'manual' as const,
                  source: 'Manual Fight Follow',
                  isActive: true,
                },
              ],
            }
          : {
              willBeNotified: false,
              reasons: (prev.notificationReasons?.reasons || []).map(r => ({
                ...r,
                isActive: false,
              })),
            },
      }));
    },
    onSuccess: (data) => {
      // Don't show toast - user is toggling in the menu and can see the switch state
      // Invalidate queries to refresh notification status
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fights'] });
      queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
      queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
    },
    onError: (error: any, enabled) => {
      // Revert optimistic update on error
      setLocalNotificationReasons(fight.notificationReasons);
      setMenuFightSnapshot(fight);
      showError(error?.error || 'Failed to update notification preference');
    },
  });

  const handleToggleNotification = (enabled: boolean) => {
    toggleNotificationMutation.mutate(enabled);
  };

  // Toggle fighter notification mutation
  const toggleFighterNotificationMutation = useMutation({
    mutationFn: async ({ fighterId, enabled }: { fighterId: string; enabled: boolean }) => {
      return apiService.updateFighterNotificationPreferences(fighterId, {
        startOfFightNotification: enabled,
      });
    },
    onMutate: async ({ fighterId, enabled }) => {
      // Optimistically update local state immediately for smooth UI
      if (fighterId === fight.fighter1Id) {
        setLocalFighter1Notification(enabled);
      } else if (fighterId === fight.fighter2Id) {
        setLocalFighter2Notification(enabled);
      }
    },
    onSuccess: () => {
      // Only invalidate queries if menu is closed to prevent jank
      if (!detailsMenuVisible) {
        queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
        queryClient.invalidateQueries({ queryKey: ['fights'] });
        queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
        queryClient.invalidateQueries({ queryKey: ['eventFights'] });
        queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
      }
    },
    onError: (error: any, { fighterId }) => {
      // Revert optimistic update on error
      if (fighterId === fight.fighter1Id) {
        setLocalFighter1Notification(fight.isFollowingFighter1);
      } else if (fighterId === fight.fighter2Id) {
        setLocalFighter2Notification(fight.isFollowingFighter2);
      }
      showError(error?.error || 'Failed to update notification preference');
    },
  });

  const handleToggleFighterNotification = (fighterId: string, enabled: boolean) => {
    toggleFighterNotificationMutation.mutate({ fighterId, enabled });
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 80 }}
      >


      {/* Who Do You Think Will Win? */}
      <View style={styles.sectionNoBorder}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Who do you think will win?
          </Text>
          <View style={styles.headerIcons}>
            {(localNotificationReasons?.willBeNotified) && (
              <FontAwesome name="bell" size={18} color={colors.tint} style={{ marginRight: 16 }} />
            )}
            <TouchableOpacity
              onPress={() => {
                // Snapshot fight data when opening menu to prevent re-renders
                setMenuFightSnapshot({
                  ...fight,
                  notificationReasons: localNotificationReasons,
                });
                setDetailsMenuVisible(true);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
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

      {/* Community Predictions */}
      <View style={styles.sectionNoBorder}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Community Predictions
        </Text>

        {/* Prediction Breakdown Chart */}
        <PredictionBarChart
          predictionStats={displayPredictionStats}
          fighter1Name={fight.fighter1.lastName}
          fighter2Name={fight.fighter2.lastName}
        />
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
                userHasUpvoted: preFightCommentsData.userComment.userHasUpvoted || false,
                user: {
                  displayName: preFightCommentsData.userComment.user.displayName,
                },
              }}
              onEdit={() => setIsEditingComment(true)}
              onUpvote={() => handleUpvoteComment(preFightCommentsData.userComment.id)}
              isUpvoting={upvotingCommentId === preFightCommentsData.userComment.id}
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
                onUpvote={() => handleUpvoteComment(comment.id)}
                onFlag={() => handleFlagComment(comment.id)}
                isUpvoting={upvotingCommentId === comment.id}
                isAuthenticated={isAuthenticated}
                showMyComment={false}
              />
            ))}
          </View>
        )}
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

      {/* Toast Notification */}
      {toastMessage !== '' && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <FontAwesome name="bell" size={16} color="#10b981" />
          <Text style={[styles.toastText, { color: '#fff' }]}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* Fight Details Menu */}
      <FightDetailsMenu
        fight={{
          ...menuFightSnapshot,
          isFollowingFighter1: localFighter1Notification,
          isFollowingFighter2: localFighter2Notification,
          notificationReasons: localNotificationReasons,
        }}
        visible={detailsMenuVisible}
        onClose={() => {
          setDetailsMenuVisible(false);
          // Invalidate queries when menu closes to update bell icons
          queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
          queryClient.invalidateQueries({ queryKey: ['fights'] });
          queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
          queryClient.invalidateQueries({ queryKey: ['eventFights'] });
          queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
        }}
        isFollowing={isFollowing}
        onToggleNotification={handleToggleNotification}
        isTogglingNotification={toggleNotificationMutation.isPending}
        onToggleFighterNotification={handleToggleFighterNotification}
        isTogglingFighterNotification={toggleFighterNotificationMutation.isPending}
      />
      </ScrollView>
    </KeyboardAvoidingView>
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
    marginBottom: 26,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 17,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderWidth: 1,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
