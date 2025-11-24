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
  Platform,
  Keyboard,
  LayoutAnimation,
  UIManager,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { FontAwesome, FontAwesome6, Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { getHypeHeatmapColor } from '../utils/heatmap';
import PredictionBarChart from './PredictionBarChart';
import HypeDistributionChart from './HypeDistributionChart';
import FightDetailsSection from './FightDetailsSection';
import { useFightStats } from '../hooks/useFightStats';
import { PreFightCommentCard } from './PreFightCommentCard';
import { useAuth } from '../store/AuthContext';
import { usePredictionAnimation } from '../store/PredictionAnimationContext';
import { FlagReviewModal } from '.';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from './CustomAlert';
import FightDetailsMenu from './FightDetailsMenu';
import Button from './Button';

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
  renderMenuButton?: () => React.ReactNode;
  detailsMenuVisible?: boolean;
  setDetailsMenuVisible?: (visible: boolean) => void;
}

// Placeholder image for fighters
const getFighterPlaceholderImage = (fighterId: string) => {
  return require('../assets/fighters/fighter-default-alpha.png');
};

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Heatmap flame icon color - solid colors for icon display
export default function UpcomingFightDetailScreen({
  fight,
  onPredictionSuccess,
  renderMenuButton,
  detailsMenuVisible: externalDetailsMenuVisible,
  setDetailsMenuVisible: externalSetDetailsMenuVisible
}: UpcomingFightDetailScreenProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
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

  // Reply state
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  // Edit reply state
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyText, setEditReplyText] = useState<string>('');
  // Use external state if provided, otherwise use local state
  const [localDetailsMenuVisible, setLocalDetailsMenuVisible] = useState(false);
  const detailsMenuVisible = externalDetailsMenuVisible !== undefined ? externalDetailsMenuVisible : localDetailsMenuVisible;
  const setDetailsMenuVisible = externalSetDetailsMenuVisible || setLocalDetailsMenuVisible;
  const [isFollowing, setIsFollowing] = useState(fight.isFollowing ?? false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [localFighter1Notification, setLocalFighter1Notification] = useState(fight.isFollowingFighter1);
  const [localFighter2Notification, setLocalFighter2Notification] = useState(fight.isFollowingFighter2);
  const [localNotificationReasons, setLocalNotificationReasons] = useState(fight.notificationReasons);

  // Track community data reveal flags
  const [hasRevealedHype, setHasRevealedHype] = useState(fight.hasRevealedHype ?? false);
  const [hasRevealedWinner, setHasRevealedWinner] = useState(fight.hasRevealedWinner ?? false);
  const [hasRevealedMethod, setHasRevealedMethod] = useState(fight.hasRevealedMethod ?? false);

  // Snapshot the fight data when menu opens to prevent re-renders during toggles
  const [menuFightSnapshot, setMenuFightSnapshot] = useState(fight);
  const scrollViewRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<View>(null);
  const replyInputRef = useRef<View>(null);

  // Keyboard height state for dynamic padding
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Animation for toast notification
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(50)).current;

  // Wheel animation for number display
  const wheelAnimation = useRef(new Animated.Value(fight.userHypePrediction ? (10 - fight.userHypePrediction) * 52 : 520)).current;

  // Simple fade animation for community predictions
  const predictionsFadeAnim = useRef(new Animated.Value(0)).current;
  const methodSubdivisionsFadeAnim = useRef(new Animated.Value(0)).current;
  const [shouldRenderPredictions, setShouldRenderPredictions] = useState(false);
  const [shouldShowMethodSubdivisions, setShouldShowMethodSubdivisions] = useState(false);

  // Fade animation for aggregate hype box (initial reveal)
  const aggregateHypeFadeAnim = useRef(new Animated.Value(0)).current;

  // Trigger slow fade-in ONLY the first time user makes hype prediction
  useEffect(() => {
    if (hasRevealedHype) {
      // Set to fully visible instantly (already revealed)
      aggregateHypeFadeAnim.setValue(1);
    }
  }, []); // Run only once on mount

  // Trigger slow fade-in when user makes their FIRST hype prediction
  useEffect(() => {
    if (selectedHype && !hasRevealedHype) {
      // First prediction - fade in slowly
      aggregateHypeFadeAnim.setValue(0);
      Animated.timing(aggregateHypeFadeAnim, {
        toValue: 1,
        duration: 2000, // 2 seconds for very slow fade
        useNativeDriver: true,
      }).start();
      // Mark as revealed
      setHasRevealedHype(true);
    }
  }, [selectedHype]);

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

  // Keyboard event listeners for dynamic padding
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        // Set keyboard height, accounting for tab bar (typically 49-83px)
        // We subtract tab bar height because SafeAreaView already handles it
        const tabBarHeight = 60; // Approximate tab bar height
        setKeyboardHeight(e.endCoordinates.height - tabBarHeight);
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  // Animate layout changes when winner selection changes
  useEffect(() => {
    if (selectedWinner) {
      // Mark as revealed when user makes first winner prediction
      if (!hasRevealedWinner) {
        setHasRevealedWinner(true);
      }

      // Mount component if not already mounted
      if (!shouldRenderPredictions) {
        setShouldRenderPredictions(true);

        // Trigger layout animation
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        // Reset to 0 first, then animate to 1
        predictionsFadeAnim.setValue(0);
        Animated.timing(predictionsFadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      }
      // If already mounted (switching fighters), don't animate - just stay visible
    } else if (!hasRevealedWinner) {
      // Only hide if user hasn't revealed winner data yet
      // Trigger layout animation
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      // Fade out, then unmount
      Animated.timing(predictionsFadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setShouldRenderPredictions(false);
        }
      });
    }
  }, [selectedWinner]);

  // Animate method subdivisions when method selection changes
  useEffect(() => {
    if (selectedMethod) {
      // Mark as revealed when user makes first method prediction
      if (!hasRevealedMethod) {
        setHasRevealedMethod(true);
      }

      // Show subdivisions if not already shown
      if (!shouldShowMethodSubdivisions) {
        setShouldShowMethodSubdivisions(true);

        // Reset to 0 first, then animate to 1
        methodSubdivisionsFadeAnim.setValue(0);
        Animated.timing(methodSubdivisionsFadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      }
      // If already shown (switching methods), don't animate - just stay visible
    } else if (!hasRevealedMethod) {
      // Only hide if user hasn't revealed method data yet
      // Fade out
      Animated.timing(methodSubdivisionsFadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setShouldShowMethodSubdivisions(false);
        }
      });
    }
  }, [selectedMethod]);

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
      queryClient.invalidateQueries({ queryKey: ['myRatings'] });

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
      queryClient.invalidateQueries({ queryKey: ['myRatings'] });

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
      queryClient.invalidateQueries({ queryKey: ['myRatings'] });

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
    onError: (error: any) => {
      console.error('Failed to save comment:', error);
      showAlert(
        'Failed to save comment',
        error?.message || 'Please try again later',
        'error'
      );
    },
  });

  // Reply to pre-fight comment
  const saveReplyMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      return apiService.createPreFightCommentReply(fight.id, commentId, content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preFightComments', fight.id] });
      setReplyingToCommentId(null);
      setReplyText('');
    },
    onError: (error: any) => {
      console.error('Failed to save reply:', error);
      showError(error?.message || 'Failed to save reply. Please try again later');
    },
  });

  const editReplyMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      return apiService.updatePreFightComment(fight.id, commentId, content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preFightComments', fight.id] });
      setEditingReplyId(null);
      setEditReplyText('');
      showSuccess('Reply updated successfully');
    },
    onError: (error: any) => {
      console.error('Failed to update reply:', error);
      showError(error?.message || 'Failed to update reply. Please try again later');
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
      // Also invalidate the top pre-flight comments cache
      queryClient.invalidateQueries({ queryKey: ['topPreFightComments'] });
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
      queryClient.invalidateQueries({ queryKey: ['myRatings'] });
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
      queryClient.invalidateQueries({ queryKey: ['myRatings'] });
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
    // Position 0 = number 10, position 52 = number 9, ... position 468 = number 1
    // Position 520 = blank (below "1")
    const targetPosition = targetNumber === 0 ? 520 : (10 - targetNumber) * 52;

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

  // Handle keyboard show - scroll to input and set focus state
  const handleCommentFocus = () => {
    setIsCommentFocused(true);
    // Scroll to the comment input after a short delay to ensure keyboard is showing
    setTimeout(() => {
      commentInputRef.current?.measureLayout(
        scrollViewRef.current as any,
        (x, y) => {
          scrollViewRef.current?.scrollTo({
            y: y - 50, // Scroll with less offset to reveal save button below
            animated: true,
          });
        },
        () => {} // Error callback
      );
    }, 300);
  };

  const handleReplyClick = (commentId: string) => {
    setReplyingToCommentId(commentId);
    // Scroll to the reply input after a short delay to ensure keyboard is showing
    setTimeout(() => {
      replyInputRef.current?.measureLayout(
        scrollViewRef.current as any,
        (x, y) => {
          scrollViewRef.current?.scrollTo({
            y: y - 50, // Scroll with less offset to reveal buttons below
            animated: true,
          });
        },
        () => {} // Error callback
      );
    }, 300);
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[styles.scrollView, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingBottom: keyboardHeight > 0 ? keyboardHeight + 100 : 80
      }}
    >


      {/* User Interaction Container */}
      <View style={[
        styles.userInteractionContainer,
        {
          backgroundColor: colorScheme === 'dark' ? 'rgba(245, 197, 24, 0.05)' : 'rgba(245, 197, 24, 0.08)',
          borderLeftColor: '#F5C518',
          marginTop: 22,
        }
      ]}>
        {/* Badge Header */}
        <View style={styles.userInteractionBadge}>
          <Text style={styles.userInteractionBadgeText}>✏️ Your Predictions</Text>
        </View>

        {/* My Picks Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: 15 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0 }}>
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              My Picks
            </Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Who Do You Think Will Win? */}
        <View style={[styles.sectionNoBorder, { marginTop: 32 }]}>
          <View style={styles.userInputTitleRow}>
            <View style={styles.yellowSideLine} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Who do you think will win?
            </Text>
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
                {fight.fighter1.firstName} {fight.fighter1.lastName}
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
                {fight.fighter2.firstName} {fight.fighter2.lastName}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* How will it end? */}
        <View style={[styles.sectionNoBorder, { marginTop: -20 }]}>
          <View style={styles.userInputTitleRow}>
            <View style={styles.yellowSideLine} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {selectedWinner
                ? `How will ${selectedWinner === fight.fighter1Id ? fight.fighter1.lastName : fight.fighter2.lastName} win?`
                : 'How will it end?'}
            </Text>
          </View>
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

        {/* My Hype Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: 2 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0 }}>
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              My Hype
            </Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* How Hyped? */}
        <View style={[styles.sectionNoBorder, { marginTop: 17 }]}>
          <View style={[styles.userInputTitleRow, { alignItems: 'center' }]}>
            <View style={styles.yellowSideLine} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              How hyped are you?
            </Text>
            {/* Spinning number wheel inline with title */}
            <View style={[styles.displayFlameContainer, { marginTop: 10, marginBottom: 0, marginLeft: 8, paddingBottom: 0 }]}>
              <View style={styles.animatedFlameContainer}>
                <View style={styles.wheelContainer} pointerEvents="none">
                  <Animated.View style={[
                    styles.wheelNumbers,
                    {
                      transform: [{
                        translateY: wheelAnimation.interpolate({
                          inputRange: [0, 520],
                          outputRange: [156, -364],
                        })
                      }]
                    }
                  ]}>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((number) => {
                      const hypeColor = getHypeHeatmapColor(number);

                      // Calculate flame color (same logic as Community area)
                      const getFlameColor = (hypeColor: string, bgColor: string) => {
                        const hypeRgbaMatch = hypeColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                        const hypeHexMatch = hypeColor.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/);

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

                        const bgRgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                        const bgHexMatch = bgColor.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/);

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

                        const mixedR = Math.round(hypeR * 0.7 + bgR * 0.3);
                        const mixedG = Math.round(hypeG * 0.7 + bgG * 0.3);
                        const mixedB = Math.round(hypeB * 0.7 + bgB * 0.3);

                        return `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
                      };

                      const flameColor = getFlameColor(hypeColor, colors.background);

                      return (
                        <View key={number} style={styles.wheelBoxContainer}>
                          <View style={[
                            styles.wheelBox,
                            { backgroundColor: hypeColor }
                          ]}>
                            <FontAwesome6
                              name="fire-flame-curved"
                              size={24}
                              color={flameColor}
                              style={{ position: 'absolute' }}
                            />
                            <Text style={styles.wheelBoxText}>{number}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </Animated.View>
                </View>
              </View>
            </View>
          </View>

          {/* Row of selectable flames (1-10) */}
          <View style={[styles.flameContainer, { flex: 1, gap: 0, marginLeft: 0, marginTop: -5, marginBottom: -13, height: 36 }]}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
            const isSelected = level <= (selectedHype || 0);
            const flameColor = isSelected ? getHypeHeatmapColor(level) : '#808080';

            return (
              <TouchableOpacity
                key={level}
                onPress={() => handleHypeSelection(level)}
                style={styles.flameButton}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <View style={{ width: 26, alignItems: 'center' }}>
                  {isSelected ? (
                    <FontAwesome6
                      name="fire-flame-curved"
                      size={26}
                      color={flameColor}
                    />
                  ) : (
                    <Image
                      source={require('../assets/flame-hollow-alpha-colored.png')}
                      style={{ width: 26, height: 26 }}
                      resizeMode="contain"
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
          </View>
        </View>
      </View>

      {/* Community Data Container */}
      <View style={[
        styles.communityDataContainer,
        {
          backgroundColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.08)',
          borderLeftColor: '#3B82F6',
        }
      ]}>
        {/* Badge Header */}
        <View style={styles.communityDataBadge}>
          <Text style={styles.communityDataBadgeText}>👥 Community Data</Text>
        </View>

        {/* Community Predictions Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: 15 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0 }}>
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              Community Predictions
            </Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

      {/* Community Predictions Data */}
      <View style={[styles.sectionNoBorder, { marginTop: 32 }]}>
        {/* Community Predictions Bar Chart - always visible */}
        {displayPredictionStats && displayPredictionStats.fighter1MethodPredictions && displayPredictionStats.fighter2MethodPredictions && displayPredictionStats.winnerPredictions && (
          <PredictionBarChart
            fighter1Name={fight.fighter1.lastName}
            fighter2Name={fight.fighter2.lastName}
            fighter1Id={fight.fighter1Id}
            fighter2Id={fight.fighter2Id}
            selectedWinner={selectedWinner}
            selectedMethod={selectedMethod}
            fighter1Predictions={displayPredictionStats.fighter1MethodPredictions}
            fighter2Predictions={displayPredictionStats.fighter2MethodPredictions}
            totalPredictions={displayPredictionStats.totalPredictions}
            winnerPredictions={displayPredictionStats.winnerPredictions}
            showColors={hasRevealedWinner}
            showLabels={hasRevealedMethod}
          />
        )}
      </View>

        {/* Community Hype Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: -8 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0 }}>
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              Community Hype
            </Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

      {/* Community Data */}
      <View style={[styles.sectionNoBorder, { marginTop: 32 }]}>
        {/* Community Data Layout: Vertical stack */}
        <View style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 18, marginTop: 0 }}>
          {/* Aggregate hype box and distribution chart - side by side */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 0 }}>
            {/* Community Hype Box */}
            {(() => {
            const hypeColor = aggregateStats?.communityAverageHype
              ? getHypeHeatmapColor(aggregateStats.communityAverageHype)
              : colors.border;

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

            const flameColor = getFlameColor(hypeColor, colors.background);

            return (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <FontAwesome name="users" size={19} color={colors.textSecondary} />
                </View>
                <View style={{ position: 'relative', width: 40, height: 40 }}>
                  {/* Grey placeholder - always visible until fully revealed */}
                  <View style={{
                    position: 'absolute',
                    width: 40,
                    height: 40,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 8,
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: colors.textSecondary,
                  }}>
                    <FontAwesome6
                      name="fire-flame-curved"
                      size={20}
                      color={colors.textSecondary}
                      style={{ position: 'absolute', opacity: 0.5 }}
                    />
                  </View>

                  {/* Colored box - fades in on top of placeholder when revealed */}
                  {hasRevealedHype && (
                    <Animated.View style={{
                      position: 'absolute',
                      width: 40,
                      height: 40,
                      opacity: aggregateHypeFadeAnim,
                    }}>
                      <View style={{
                        width: 40,
                        height: 40,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderRadius: 8,
                        backgroundColor: hypeColor,
                      }}>
                        <FontAwesome6
                          name="fire-flame-curved"
                          size={24}
                          color={flameColor}
                          style={{ position: 'absolute' }}
                        />
                        <Text style={{
                          color: '#FFFFFF',
                          fontSize: 14,
                          fontWeight: 'bold',
                          textAlign: 'center',
                        }}>
                          {aggregateStats?.communityAverageHype ? aggregateStats.communityAverageHype.toFixed(1) : '--'}
                        </Text>
                      </View>
                    </Animated.View>
                  )}
                </View>
              </View>
            );
          })()}

            {/* Hype Distribution Chart - below aggregate hype box */}
            {aggregateStats?.hypeDistribution && (
              <View style={{ marginTop: -6 }}>
                <HypeDistributionChart
                  distribution={aggregateStats.hypeDistribution}
                  totalPredictions={aggregateStats.totalPredictions || 0}
                  hasRevealedHype={hasRevealedHype}
                  fadeAnim={aggregateHypeFadeAnim}
                />
              </View>
            )}
          </View>
        </View>
        </View>
      </View>

      {/* Comments Section Divider */}
      <View style={[styles.sectionDivider, { marginTop: 7 }]}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <View style={{ flexShrink: 0 }}>
          <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
            Comments
          </Text>
        </View>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      {/* Comments */}
      <View style={[styles.sectionNoBorder, { marginTop: 18 }]}>
        {/* Title row with Add Comment / Cancel button */}
        <View style={styles.commentHeaderRow}>
          <View style={{ flex: 1 }} />
          {!preFightCommentsData?.userComment && !isEditingComment && !showCommentForm && (
            <Button
              onPress={() => setShowCommentForm(!showCommentForm)}
              variant="outline"
              size="small"
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
              }}
              textStyle={{
                color: colors.text,
              }}
            >
              + Add
            </Button>
          )}
          {!preFightCommentsData?.userComment && !isEditingComment && showCommentForm && (
            <Button
              onPress={() => setShowCommentForm(!showCommentForm)}
              variant="outline"
              size="small"
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
              }}
              textStyle={{
                color: colors.text,
              }}
            >
              Cancel
            </Button>
          )}
          {isEditingComment && (
            <Button
              onPress={() => {
                setIsEditingComment(false);
                setPreFightComment(preFightCommentsData?.userComment?.content || '');
              }}
              variant="outline"
              size="small"
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
              }}
              textStyle={{
                color: colors.text,
              }}
            >
              Cancel
            </Button>
          )}
        </View>

        {/* Show comment input when showCommentForm is true (for new comments) OR when editing */}
        {((showCommentForm && !preFightCommentsData?.userComment) || isEditingComment) && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={100}
          >
            <View ref={commentInputRef} collapsable={false} style={{ marginTop: 10 }}>
              <View style={[
                styles.commentInputContainer,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }
              ]}>
                <TextInput
                  style={[
                    styles.commentInput,
                    { color: colors.text }
                  ]}
                  placeholder={
                    selectedHype && selectedHype > 0
                      ? `Why are you ${selectedHype}/10 hyped for this fight?`
                      : "Why are you hyped for this fight?"
                  }
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  value={preFightComment}
                  onChangeText={setPreFightComment}
                  onFocus={handleCommentFocus}
                  onBlur={() => setIsCommentFocused(false)}
                  autoFocus={true}
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
          </KeyboardAvoidingView>
        )}

        {/* Display All Pre-Fight Comments */}
        {preFightCommentsData && preFightCommentsData.comments && preFightCommentsData.comments.length > 0 && (
          <View style={{ marginTop: 10 }}>

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
              <React.Fragment key={comment.id}>
                <PreFightCommentCard
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
                  onReply={() => handleReplyClick(comment.id)}
                  isUpvoting={upvotingCommentId === comment.id}
                  isAuthenticated={isAuthenticated}
                  showMyComment={false}
                />

                {/* Reply form - shown when replying to this comment */}
                {replyingToCommentId === comment.id && (
                  <View ref={replyInputRef} collapsable={false} style={{ marginLeft: 40, marginTop: 8, marginBottom: 12 }}>
                    <View style={[
                      styles.commentInputContainer,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      }
                    ]}>
                      <TextInput
                        style={[
                          styles.commentInput,
                          { color: colors.text }
                        ]}
                        placeholder="Write your reply..."
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={3}
                        maxLength={500}
                        value={replyText}
                        onChangeText={setReplyText}
                        autoFocus={true}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.saveCommentButton,
                          {
                            flex: 1,
                            backgroundColor: replyText.trim().length > 0 ? colors.tint : colors.card,
                          }
                        ]}
                        disabled={saveReplyMutation.isPending || replyText.trim().length === 0}
                        onPress={() => {
                          if (replyText.trim()) {
                            saveReplyMutation.mutate({ commentId: comment.id, content: replyText.trim() });
                          }
                        }}
                      >
                        <Text style={[
                          styles.saveCommentButtonText,
                          { color: replyText.trim().length > 0 ? '#000' : colors.text }
                        ]}>
                          {saveReplyMutation.isPending ? 'Saving...' : 'Submit Reply'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.saveCommentButton,
                          {
                            flex: 1,
                            backgroundColor: colors.card,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }
                        ]}
                        onPress={() => {
                          setReplyingToCommentId(null);
                          setReplyText('');
                        }}
                      >
                        <Text style={[
                          styles.saveCommentButtonText,
                          { color: colors.text }
                        ]}>
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Display replies - with left margin */}
                {comment.replies && comment.replies.length > 0 && (
                  <View style={{ marginLeft: 40, marginTop: replyingToCommentId === comment.id ? 50 : 2 }}>
                    {comment.replies.map((reply: any) => {
                      const isMyReply = reply.user?.id === user?.id;
                      return (
                        <React.Fragment key={reply.id}>
                          {editingReplyId === reply.id ? (
                            // Edit form for reply
                            <View style={{ marginBottom: 12 }}>
                              <View style={[
                                styles.commentInputContainer,
                                {
                                  backgroundColor: colors.card,
                                  borderColor: colors.border,
                                }
                              ]}>
                                <TextInput
                                  style={[
                                    styles.commentInput,
                                    { color: colors.text }
                                  ]}
                                  placeholder="Edit your reply..."
                                  placeholderTextColor={colors.textSecondary}
                                  multiline
                                  numberOfLines={4}
                                  maxLength={500}
                                  value={editReplyText}
                                  onChangeText={setEditReplyText}
                                  autoFocus={true}
                                />
                              </View>
                              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                <TouchableOpacity
                                  style={[
                                    styles.saveCommentButton,
                                    {
                                      backgroundColor: editReplyText.trim().length > 0 ? colors.tint : colors.card,
                                      flex: 1,
                                    }
                                  ]}
                                  disabled={editReplyText.trim().length === 0 || editReplyMutation.isPending}
                                  onPress={() => {
                                    editReplyMutation.mutate({ commentId: reply.id, content: editReplyText });
                                  }}
                                >
                                  <Text style={[
                                    styles.saveCommentButtonText,
                                    { color: editReplyText.trim().length > 0 ? '#000' : colors.text }
                                  ]}>
                                    Save
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[
                                    styles.saveCommentButton,
                                    {
                                      backgroundColor: colors.card,
                                      borderWidth: 1,
                                      borderColor: colors.border,
                                      flex: 1,
                                    }
                                  ]}
                                  onPress={() => {
                                    setEditingReplyId(null);
                                    setEditReplyText('');
                                  }}
                                >
                                  <Text style={[
                                    styles.saveCommentButtonText,
                                    { color: colors.text }
                                  ]}>
                                    Cancel
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            <PreFightCommentCard
                              comment={{
                                id: reply.id,
                                content: reply.content,
                                hypeRating: reply.hypeRating,
                                upvotes: reply.upvotes || 0,
                                userHasUpvoted: reply.userHasUpvoted || false,
                                user: {
                                  displayName: reply.user.displayName,
                                },
                              }}
                              onUpvote={() => handleUpvoteComment(reply.id)}
                              onFlag={() => handleFlagComment(reply.id)}
                              onEdit={isMyReply ? () => {
                                setEditingReplyId(reply.id);
                                setEditReplyText(reply.content);
                              } : undefined}
                              isUpvoting={upvotingCommentId === reply.id}
                              isAuthenticated={isAuthenticated}
                              showMyComment={isMyReply}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </View>
                )}
              </React.Fragment>
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
      queryClient.invalidateQueries({ queryKey: ['myRatings'] });
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
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  section: {
    marginHorizontal: 4,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionNoBorder: {
    marginHorizontal: 4,
    marginBottom: 12,
    padding: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 0,
  },
  userInputTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  yellowSideLine: {
    width: 3,
    height: 20,
    backgroundColor: '#F5C518',
    borderRadius: 1.5,
  },
  userInteractionContainer: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 16,
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 4,
    paddingRight: 4,
    borderRadius: 16,
    borderLeftWidth: 4,
  },
  userInteractionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5C518',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
    marginLeft: 10,
  },
  userInteractionBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
  communityDataContainer: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 16,
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 4,
    paddingRight: 4,
    borderRadius: 16,
    borderLeftWidth: 4,
  },
  communityDataBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
    marginLeft: 10,
  },
  communityDataBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: -24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  communityTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  communitySectionTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fighterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  fighterButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  fighterButtonImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  fighterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
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
    height: 52,
  },
  wheelContainer: {
    flex: 1,
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
  wheelBoxContainer: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  wheelBoxText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
    gap: 8,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  methodButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
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
    marginBottom: 6,
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
    padding: 10,
  },
  commentInput: {
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  saveCommentButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
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
