import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import * as Haptics from 'expo-haptics';
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
import { useVerification } from '../store/VerificationContext';
import { FlagReviewModal } from '.';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from './CustomAlert';
import FightDetailsMenu from './FightDetailsMenu';
import Button from './Button';
import SectionContainer from './SectionContainer';
import { isTBAFighterName } from '../constants/tba';

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
  hasTBAFighter?: boolean; // True if either fighter is TBA (To Be Announced)
}

interface UpcomingFightDetailScreenProps {
  fight: Fight;
  onPredictionSuccess?: () => void;
  renderMenuButton?: () => React.ReactNode;
  detailsMenuVisible?: boolean;
  setDetailsMenuVisible?: (visible: boolean) => void;
  onNotificationEnabled?: () => void;
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
  setDetailsMenuVisible: externalSetDetailsMenuVisible,
  onNotificationEnabled,
}: UpcomingFightDetailScreenProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const { setPendingAnimation } = usePredictionAnimation();
  const { requireVerification } = useVerification();
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
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const INITIAL_REPLIES_SHOWN = 3;

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

  // Community data is always visible (no reveal gating)
  const hasRevealedHype = true;
  const hasRevealedWinner = true;
  const hasRevealedMethod = true;

  // Check if fight has a TBA (To Be Announced) fighter - predictions disabled
  const hasTBA = useMemo(() => {
    // Check API response first, then fallback to fighter name check
    return fight.hasTBAFighter ||
           isTBAFighterName(fight.fighter1.firstName) ||
           isTBAFighterName(fight.fighter2.firstName);
  }, [fight.hasTBAFighter, fight.fighter1.firstName, fight.fighter2.firstName]);

  // Check if pre-fight activity is locked (fight has started)
  const isPreFightLocked = fight.hasStarted;

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
  // Using 115px per item for taller hype boxes (90x105)
  const wheelAnimation = useRef(new Animated.Value(fight.userHypePrediction ? (10 - fight.userHypePrediction) * 115 : 1150)).current;

  // Simple fade animation for community predictions (always visible now)
  const predictionsFadeAnim = useRef(new Animated.Value(1)).current;
  const methodSubdivisionsFadeAnim = useRef(new Animated.Value(1)).current;
  const [shouldRenderPredictions, setShouldRenderPredictions] = useState(true);
  const [shouldShowMethodSubdivisions, setShouldShowMethodSubdivisions] = useState(true);

  // Fade animation for aggregate hype box (always visible now)
  const aggregateHypeFadeAnim = useRef(new Animated.Value(1)).current;

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

  // Community data is always visible - no animation needed for reveal
  // Use real fetched prediction stats
  const displayPredictionStats = predictionStats;

  // Helper to optimistically update events cache for predictions
  const updateEventsCache = (updates: { userPredictedWinner?: string | null; userPredictedMethod?: string | null; userHypePrediction?: number | null }) => {
    queryClient.setQueryData(['upcomingEvents', isAuthenticated], (old: any) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          events: page.events.map((event: any) => ({
            ...event,
            fights: event.fights?.map((f: any) =>
              f.id === fight.id ? { ...f, ...updates } : f
            ) || [],
          })),
        })),
      };
    });
  };

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
    onMutate: async (winnerId) => {
      await queryClient.cancelQueries({ queryKey: ['upcomingEvents'] });
      const previousEvents = queryClient.getQueryData(['upcomingEvents', isAuthenticated]);
      updateEventsCache({ userPredictedWinner: winnerId });
      return { previousEvents };
    },
    onError: (err, winnerId, context: any) => {
      if (context?.previousEvents) {
        queryClient.setQueryData(['upcomingEvents', isAuthenticated], context.previousEvents);
      }
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
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });

      onPredictionSuccess?.();
    },
  });

  // Auto-save hype selection
  const saveHypeMutation = useMutation({
    mutationFn: async (hypeLevel: number | null) => {
      console.log('[saveHypeMutation] Saving hype:', hypeLevel);
      return apiService.createFightPrediction(fight.id, {
        predictedRating: hypeLevel ?? undefined,
        // Keep existing values
        predictedWinner: selectedWinner || undefined,
        predictedMethod: selectedMethod || undefined,
        predictedRound: fight.userPredictedRound || undefined,
      });
    },
    onMutate: async (hypeLevel) => {
      await queryClient.cancelQueries({ queryKey: ['upcomingEvents'] });
      const previousEvents = queryClient.getQueryData(['upcomingEvents', isAuthenticated]);
      updateEventsCache({ userHypePrediction: hypeLevel });
      return { previousEvents };
    },
    onSuccess: (data) => {
      console.log('[saveHypeMutation] Success:', data);
      // Mark this fight as needing animation
      setPendingAnimation(fight.id);
      onPredictionSuccess?.();
    },
    onError: (error, hypeLevel, context: any) => {
      console.error('[saveHypeMutation] Error:', error);
      if (context?.previousEvents) {
        queryClient.setQueryData(['upcomingEvents', isAuthenticated], context.previousEvents);
      }
    },
    onSettled: () => {
      // Always invalidate queries, even on error (to reset state)
      console.log('[saveHypeMutation] Invalidating queries');
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
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });
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
    onMutate: async (method) => {
      await queryClient.cancelQueries({ queryKey: ['upcomingEvents'] });
      const previousEvents = queryClient.getQueryData(['upcomingEvents', isAuthenticated]);
      updateEventsCache({ userPredictedMethod: method });
      return { previousEvents };
    },
    onError: (err, method, context: any) => {
      if (context?.previousEvents) {
        queryClient.setQueryData(['upcomingEvents', isAuthenticated], context.previousEvents);
      }
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
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });

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
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['preFightComments', fight.id] });
      setReplyingToCommentId(null);
      setReplyText('');

      // Show toast if user has reached the comment limit
      if (data?.reachedCommentLimit) {
        showToast('You have now reached the maximum comments allowed for one fight (5)');
      }
    },
    onError: (error: any) => {
      console.error('Failed to save reply:', error);

      // Check for specific error codes and show appropriate messages
      if (error?.code === 'USER_MAX_COMMENTS_REACHED') {
        showError("You've reached the maximum of 5 comments posted on this fight");
      } else if (error?.code === 'MAX_REPLIES_REACHED') {
        showError('This comment has reached the maximum number of replies (10)');
      } else {
        showError(error?.error || error?.message || 'Failed to save reply. Please try again later');
      }
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

  // Handler for saving reply edits (with delete confirmation)
  const handleSaveReplyEdit = async (replyId: string, originalContent: string) => {
    // Check if user is trying to delete the reply
    const isDeletingReply = originalContent && !editReplyText.trim();

    // Confirm deletion if user is removing their reply
    if (isDeletingReply) {
      showConfirm(
        'Are you sure you want to delete your reply?',
        () => {
          // User confirmed deletion - save empty string to delete
          editReplyMutation.mutate({ commentId: replyId, content: '' });
        },
        'Delete Reply',
        'Delete',
        'Cancel',
        true // destructive style
      );
      return;
    }

    // If no text entered and it's not a deletion scenario, just cancel
    if (!editReplyText.trim()) {
      setEditingReplyId(null);
      setEditReplyText('');
      return;
    }

    // Save the edited reply
    editReplyMutation.mutate({ commentId: replyId, content: editReplyText.trim() });
  };

  // Manual save handler for comment
  const handleSaveComment = async () => {
    // Require email verification
    if (!requireVerification('post a comment')) return;

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

    try {
      // Save the comment - this returns the created/updated comment
      // Note: Backend auto-upvotes new top-level comments
      await saveCommentMutation.mutateAsync(preFightComment.trim());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Invalidate queries to refresh the comment list
      await queryClient.invalidateQueries({ queryKey: ['preFightComments', fight.id] });

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
    if (!requireVerification('flag a comment')) return;
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

        // Update user comment if it's the one being upvoted, or check its replies
        let updatedUserComment = old.userComment;
        if (old.userComment?.id === commentId) {
          updatedUserComment = {
            ...old.userComment,
            userHasUpvoted: !old.userComment.userHasUpvoted,
            upvotes: old.userComment.userHasUpvoted
              ? old.userComment.upvotes - 1
              : old.userComment.upvotes + 1,
          };
        } else if (old.userComment?.replies && old.userComment.replies.length > 0) {
          // Check if a reply to user's comment is being upvoted
          const updatedReplies = old.userComment.replies.map((reply: any) =>
            reply.id === commentId
              ? {
                  ...reply,
                  userHasUpvoted: !reply.userHasUpvoted,
                  upvotes: reply.userHasUpvoted ? reply.upvotes - 1 : reply.upvotes + 1,
                }
              : reply
          );
          if (updatedReplies.some((r: any, i: number) => r !== old.userComment.replies[i])) {
            updatedUserComment = { ...old.userComment, replies: updatedReplies };
          }
        }

        // Update comments array (including nested replies)
        const updatedComments = old.comments.map((comment: any) => {
          // Check if the comment itself is being upvoted
          if (comment.id === commentId) {
            return {
              ...comment,
              userHasUpvoted: !comment.userHasUpvoted,
              upvotes: comment.userHasUpvoted ? comment.upvotes - 1 : comment.upvotes + 1,
            };
          }

          // Check if any reply is being upvoted
          if (comment.replies && comment.replies.length > 0) {
            const updatedReplies = comment.replies.map((reply: any) =>
              reply.id === commentId
                ? {
                    ...reply,
                    userHasUpvoted: !reply.userHasUpvoted,
                    upvotes: reply.userHasUpvoted ? reply.upvotes - 1 : reply.upvotes + 1,
                  }
                : reply
            );

            // Only return updated comment if a reply was actually updated
            if (updatedReplies.some((r: any, i: number) => r !== comment.replies[i])) {
              return { ...comment, replies: updatedReplies };
            }
          }

          return comment;
        });

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

        // Update user comment if it's the one being upvoted, or check its replies
        let updatedUserComment = old.userComment;
        if (old.userComment?.id === commentId) {
          updatedUserComment = {
            ...old.userComment,
            userHasUpvoted: data.userHasUpvoted,
            upvotes: data.upvotes,
          };
        } else if (old.userComment?.replies && old.userComment.replies.length > 0) {
          // Check if a reply to user's comment was upvoted
          const updatedReplies = old.userComment.replies.map((reply: any) =>
            reply.id === commentId
              ? {
                  ...reply,
                  userHasUpvoted: data.userHasUpvoted,
                  upvotes: data.upvotes,
                }
              : reply
          );
          if (updatedReplies.some((r: any, i: number) => r !== old.userComment.replies[i])) {
            updatedUserComment = { ...old.userComment, replies: updatedReplies };
          }
        }

        // Update comments array (including nested replies)
        const updatedComments = old.comments.map((comment: any) => {
          // Check if the comment itself was upvoted
          if (comment.id === commentId) {
            return {
              ...comment,
              userHasUpvoted: data.userHasUpvoted,
              upvotes: data.upvotes,
            };
          }

          // Check if any reply was upvoted
          if (comment.replies && comment.replies.length > 0) {
            const updatedReplies = comment.replies.map((reply: any) =>
              reply.id === commentId
                ? {
                    ...reply,
                    userHasUpvoted: data.userHasUpvoted,
                    upvotes: data.upvotes,
                  }
                : reply
            );

            // Only return updated comment if a reply was actually updated
            if (updatedReplies.some((r: any, i: number) => r !== comment.replies[i])) {
              return { ...comment, replies: updatedReplies };
            }
          }

          return comment;
        });

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!requireVerification('upvote a comment')) return;
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

    // Auto-dismiss after 3.5 seconds
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
    }, 3500);
  };

  // Toggle fight notification mutation
  const toggleNotificationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiService.toggleFightNotification(fight.id, enabled);
    },
    onMutate: async (enabled) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['upcomingEvents'] });
      await queryClient.cancelQueries({ queryKey: ['fight', fight.id] });

      // Snapshot previous caches for rollback
      const previousEvents = queryClient.getQueryData(['upcomingEvents', isAuthenticated]);
      const previousFight = queryClient.getQueryData(['fight', fight.id, isAuthenticated]);

      // Helper to calculate new notification state
      const getNewNotificationReasons = (oldReasons: any) => {
        if (enabled) {
          return {
            willBeNotified: true,
            reasons: [
              ...(oldReasons?.reasons || []).filter((r: any) => r.isActive && r.type !== 'manual'),
              { type: 'manual' as const, source: 'Manual Fight Follow', isActive: true },
            ],
          };
        } else {
          const updatedReasons = (oldReasons?.reasons || []).map((r: any) =>
            r.type === 'manual' ? { ...r, isActive: false } : r
          );
          const hasOtherActiveReasons = updatedReasons.some((r: any) => r.isActive && r.type !== 'manual');
          return { willBeNotified: hasOtherActiveReasons, reasons: updatedReasons };
        }
      };

      // Optimistically update local state
      const newReasons = getNewNotificationReasons(localNotificationReasons);
      setLocalNotificationReasons(newReasons);

      // Update the menu snapshot
      setMenuFightSnapshot(prev => ({
        ...prev,
        notificationReasons: getNewNotificationReasons(prev.notificationReasons),
      }));

      // Optimistically update fight detail query (for header bell icon)
      queryClient.setQueryData(['fight', fight.id, isAuthenticated], (old: any) => {
        if (!old?.fight) return old;
        return {
          ...old,
          fight: {
            ...old.fight,
            notificationReasons: getNewNotificationReasons(old.fight.notificationReasons),
          },
        };
      });

      // Optimistically update events list (infinite query) for instant bell icon update
      queryClient.setQueryData(['upcomingEvents', isAuthenticated], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            events: page.events.map((event: any) => ({
              ...event,
              fights: event.fights?.map((f: any) =>
                f.id === fight.id
                  ? { ...f, notificationReasons: getNewNotificationReasons(f.notificationReasons) }
                  : f
              ) || [],
            })),
          })),
        };
      });

      return { previousEvents, previousFight };
    },
    onSuccess: (data, enabled) => {
      // Show toast when notification is enabled (inside FightDetailsMenu modal)
      if (enabled) {
        showToast('You will get a notification right before this fight.');
      }
      // Invalidate other queries but NOT the current fight query
      // (we already did optimistic update, invalidating would refetch and potentially overwrite)
      queryClient.invalidateQueries({ queryKey: ['fights'] });
      queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
      queryClient.invalidateQueries({ queryKey: ['myRatings'] });
      queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });
    },
    onError: (error: any, enabled, context: any) => {
      // Revert optimistic update on error
      setLocalNotificationReasons(fight.notificationReasons);
      setMenuFightSnapshot(fight);
      if (context?.previousFight) {
        queryClient.setQueryData(['fight', fight.id, isAuthenticated], context.previousFight);
      }
      if (context?.previousEvents) {
        queryClient.setQueryData(['upcomingEvents', isAuthenticated], context.previousEvents);
      }
      showError(error?.error || 'Failed to update notification preference');
    },
  });

  const handleToggleNotification = (enabled: boolean) => {
    if (!requireVerification('follow this fight')) return;
    // Switch now shows hasManualNotification, so enabled is the correct value
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
    if (!requireVerification('follow this fighter')) return;
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
    // Position 0 = number 10, position 115 = number 9, ... position 1035 = number 1
    // Position 1150 = blank (below "1")
    const targetPosition = targetNumber === 0 ? 1150 : (10 - targetNumber) * 115;

    // Simple, smooth animation
    Animated.timing(wheelAnimation, {
      toValue: targetPosition,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handleWinnerSelection = (fighterId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!requireVerification('make a prediction')) return;
    const newWinner = selectedWinner === fighterId ? null : fighterId;
    setSelectedWinner(newWinner);
    saveWinnerMutation.mutate(newWinner);
  };

  const handleHypeSelection = (level: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!requireVerification('rate hype')) return;
    // If tapping the same level, deselect (set to null)
    const newHype = selectedHype === level ? null : level;
    setSelectedHype(newHype);
    animateToNumber(newHype || 0);
    saveHypeMutation.mutate(newHype);
  };

  const handleMethodSelection = (method: 'KO_TKO' | 'SUBMISSION' | 'DECISION') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!requireVerification('make a prediction')) return;
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
    if (!requireVerification('reply to a comment')) return;
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


      {/* Your Predictions Section */}
      <SectionContainer
        title="My Picks"
        icon="user"
        iconColor="#000"
        headerBgColor="#F5C518"
        containerBgColorDark="rgba(245, 197, 24, 0.05)"
        containerBgColorLight="rgba(245, 197, 24, 0.08)"
      >
        {/* Locked banner when fight has started */}
        {isPreFightLocked && (
          <View style={{
            backgroundColor: colorScheme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <FontAwesome name="lock" size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
              Predictions are locked. This fight has started.
            </Text>
          </View>
        )}

        {/* Who Will Win Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: 10, marginBottom: 0 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 4 }} />
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              Who do you think will win?
            </Text>
            <View style={{ width: 4 }} />
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* TBA Notice - shown when opponent is not yet announced */}
        {hasTBA && (
          <View style={{ marginTop: 12, paddingHorizontal: 16 }}>
            <View style={{
              backgroundColor: colors.border + '40',
              borderRadius: 8,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                Predictions disabled - opponent not yet announced
              </Text>
            </View>
          </View>
        )}

        {/* Fighter Selection */}
        <View style={{ marginTop: 18 }}>
          <View style={styles.fighterButtons}>
            <TouchableOpacity
              style={[
                styles.fighterButton,
                {
                  backgroundColor: selectedWinner === fight.fighter1.id ? '#F5C518' : 'transparent',
                  borderColor: colors.border,
                  opacity: (isPreFightLocked || hasTBA) ? 0.5 : 1,
                }
              ]}
              onPress={() => handleWinnerSelection(fight.fighter1.id)}
              disabled={isPreFightLocked || hasTBA}
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
                  backgroundColor: selectedWinner === fight.fighter2.id ? '#F5C518' : 'transparent',
                  borderColor: colors.border,
                  opacity: (isPreFightLocked || hasTBA) ? 0.5 : 1,
                }
              ]}
              onPress={() => handleWinnerSelection(fight.fighter2.id)}
              disabled={isPreFightLocked || hasTBA}
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

        {/* How? Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: 18, marginBottom: 0 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 4 }} />
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              {selectedWinner === fight.fighter1.id
                ? `How will ${fight.fighter1.lastName} win?`
                : selectedWinner === fight.fighter2.id
                  ? `How will ${fight.fighter2.lastName} win?`
                  : 'How will it end?'}
            </Text>
            <View style={{ width: 4 }} />
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Method Selection */}
        <View style={{ marginTop: 17 }}>
          <View style={styles.methodButtons}>
            {(['KO_TKO', 'SUBMISSION', 'DECISION'] as const).map((method) => {
              return (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.methodButton,
                    {
                      backgroundColor: selectedMethod === method ? '#F5C518' : 'transparent',
                      borderColor: colors.border,
                      opacity: (isPreFightLocked || hasTBA) ? 0.5 : 1,
                    }
                  ]}
                  onPress={() => handleMethodSelection(method)}
                  disabled={isPreFightLocked || hasTBA}
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

        {/* How Hyped Are You Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: 18, marginBottom: 0 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 4 }} />
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              How hyped are you?
            </Text>
            <View style={{ width: 4 }} />
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Large Flame Display */}
        <View style={{ alignItems: 'center', marginTop: 23, marginBottom: 8 }}>
          <View style={{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden', height: 115 }}>
            <Animated.View style={[
              {
                alignItems: 'center',
                paddingTop: 188,
                transform: [{
                  translateY: wheelAnimation.interpolate({
                    inputRange: [0, 1150],
                    outputRange: [479, -671],
                  })
                }]
              }
            ]}>
              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((number) => {
                const hypeColor = getHypeHeatmapColor(number);
                return (
                  <View key={number} style={{ height: 115, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ justifyContent: 'center', alignItems: 'center', position: 'relative', width: 90, height: 105 }}>
                      {/* Background circle for better text contrast */}
                      <View style={{
                        position: 'absolute',
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: hypeColor,
                        opacity: 0.4,
                        top: 30,
                      }} />
                      <FontAwesome6
                        name="fire-flame-curved"
                        size={90}
                        color={hypeColor}
                      />
                      <Text style={{
                        position: 'absolute',
                        marginTop: 6,
                        fontSize: 34,
                        fontWeight: 'bold',
                        color: '#FFFFFF',
                        textShadowColor: 'rgba(0,0,0,0.8)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 4,
                      }}>{number}</Text>
                    </View>
                  </View>
                );
              })}
              {/* Grey placeholder flame - shown when no hype selected */}
              <View style={{ height: 115, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ justifyContent: 'center', alignItems: 'center', position: 'relative', width: 90, height: 105 }}>
                  <Image
                    source={require('../assets/flame-hollow-alpha-colored.png')}
                    style={{ width: 90, height: 90, tintColor: '#666666' }}
                    resizeMode="contain"
                  />
                </View>
              </View>
            </Animated.View>
          </View>
        </View>

        {/* Row of selectable flames (1-10) */}
        <View style={[styles.flameContainer, { flex: 1, gap: 0, marginLeft: 0, marginTop: -5, marginBottom: 10, height: 42, justifyContent: 'center', opacity: isPreFightLocked ? 0.5 : 1 }]}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
            const isSelected = level <= (selectedHype || 0);
            const flameColor = isSelected ? getHypeHeatmapColor(level) : '#808080';

            return (
              <TouchableOpacity
                key={level}
                onPress={() => handleHypeSelection(level)}
                style={styles.flameButton}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                disabled={isPreFightLocked}
              >
                <View style={{ width: 32, alignItems: 'center' }}>
                  {isSelected ? (
                    <FontAwesome6
                      name="fire-flame-curved"
                      size={32}
                      color={flameColor}
                    />
                  ) : (
                    <Image
                      source={require('../assets/flame-hollow-alpha-thicker-truealpha.png')}
                      style={{ width: 32, height: 32 }}
                      resizeMode="contain"
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionContainer>

      {/* Community Data Section */}
      <SectionContainer
        title="Crowd Picks"
        icon="users"
        iconColor="#000"
        headerBgColor="#83B4F3"
        containerBgColorDark="rgba(131, 180, 243, 0.05)"
        containerBgColorLight="rgba(131, 180, 243, 0.08)"
      >
        {/* Community Predictions Data */}
        <View style={{ marginTop: -22 }}>
        {/* Community Predictions Bar Chart - always visible */}
        {displayPredictionStats && displayPredictionStats.fighter1MethodPredictions && displayPredictionStats.fighter2MethodPredictions && displayPredictionStats.winnerPredictions && (
          <PredictionBarChart
            fighter1Name={fight.fighter1.lastName}
            fighter2Name={fight.fighter2.lastName}
            fighter1Id={fight.fighter1Id}
            fighter2Id={fight.fighter2Id}
            fighter1Image={fight.fighter1.profileImage}
            fighter2Image={fight.fighter2.profileImage}
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
        <View style={[styles.sectionDivider, { marginTop: 12, marginBottom: 0 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 4 }} />
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              How Hyped? ({aggregateStats?.totalPredictions || 0})
            </Text>
            <View style={{ width: 4 }} />
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

      {/* Community Hype Data */}
      <View style={{ marginTop: 14, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 0 }}>
          {/* Large Hype Box (like UpcomingFightCard) */}
          {(() => {
            const hypeColor = aggregateStats?.communityAverageHype
              ? getHypeHeatmapColor(aggregateStats.communityAverageHype)
              : colors.border;

            return (
              <View style={{ position: 'relative', width: 90, height: 105, justifyContent: 'center', alignItems: 'center' }}>
                {/* Grey placeholder box - shown until revealed */}
                {!hasRevealedHype && (
                  <View style={{
                    width: 80,
                    height: 90,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.textSecondary,
                    backgroundColor: 'transparent',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    <FontAwesome6
                      name="fire-flame-curved"
                      size={28}
                      color={colors.textSecondary}
                      style={{ opacity: 0.5 }}
                    />
                  </View>
                )}

                {/* Colored hype box - fades in when revealed */}
                {hasRevealedHype && (
                  <Animated.View style={{ opacity: aggregateHypeFadeAnim }}>
                    <View style={{
                      width: 80,
                      height: 90,
                      borderRadius: 12,
                      backgroundColor: aggregateStats?.communityAverageHype > 0 ? hypeColor : 'transparent',
                      borderWidth: aggregateStats?.communityAverageHype > 0 ? 0 : 1,
                      borderColor: colors.textSecondary,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                      <FontAwesome6
                        name="fire-flame-curved"
                        size={28}
                        color={aggregateStats?.communityAverageHype > 0 ? 'rgba(0,0,0,0.45)' : colors.textSecondary}
                        style={aggregateStats?.communityAverageHype > 0 ? {} : { opacity: 0.5 }}
                      />
                      {aggregateStats?.communityAverageHype > 0 && (
                        <Text style={{
                          fontSize: 28,
                          fontWeight: 'bold',
                          color: '#FFFFFF',
                          textShadowColor: 'rgba(0,0,0,0.7)',
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 3,
                        }}>
                          {aggregateStats.communityAverageHype === 10 ? '10' : aggregateStats.communityAverageHype.toFixed(1)}
                        </Text>
                      )}
                    </View>
                  </Animated.View>
                )}
              </View>
            );
          })()}

          {/* Hype Distribution Chart */}
            {aggregateStats?.hypeDistribution && (
              <View style={{ flex: 1, marginLeft: -10 }}>
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
      </SectionContainer>

      {/* Comments Section */}
      <SectionContainer
        title="Comments"
        icon="comment"
        iconColor="#fff"
        headerBgColor="#4a4a4a"
        containerBgColorDark="rgba(74, 74, 74, 0.15)"
        containerBgColorLight="rgba(74, 74, 74, 0.08)"
        headerRight={
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
            ({preFightCommentsData?.comments?.reduce((acc: number, c: any) => acc + 1 + (c.replies?.length || 0), 0) || 0})
          </Text>
        }
      >
        {/* Locked banner when fight has started */}
        {isPreFightLocked && (
          <View style={{
            backgroundColor: colorScheme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <FontAwesome name="lock" size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
              Pre-fight activity is closed. This fight has started.
            </Text>
          </View>
        )}

        {/* Title row with Add Comment / Cancel button */}
        <View style={[styles.commentHeaderRow, { justifyContent: 'center' }]}>
          {!isPreFightLocked && !preFightCommentsData?.userComment && !isEditingComment && !showCommentForm && (
            <Button
              onPress={() => {
                if (!requireVerification('add a comment')) return;
                setShowCommentForm(true);
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
              + Add Comment
            </Button>
          )}
          {!isPreFightLocked && !preFightCommentsData?.userComment && !isEditingComment && showCommentForm && (
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
          {!isPreFightLocked && isEditingComment && (
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

        {/* Show comment input when showCommentForm is true (for new comments) OR when editing - only if not locked */}
        {!isPreFightLocked && ((showCommentForm && !preFightCommentsData?.userComment) || isEditingComment) && (
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
                  borderWidth: (preFightCommentsData?.userComment || preFightComment.trim().length > 0) ? 0 : 1,
                  borderColor: colors.border,
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
            <View>
              <PreFightCommentCard
                comment={{
                  id: preFightCommentsData.userComment.id,
                  content: preFightCommentsData.userComment.content,
                  hypeRating: selectedHype,
                  predictedWinner: selectedWinner,
                  predictedMethod: selectedMethod,
                  upvotes: preFightCommentsData.userComment.upvotes || 0,
                  userHasUpvoted: preFightCommentsData.userComment.userHasUpvoted || false,
                  user: {
                    displayName: preFightCommentsData.userComment.user.displayName,
                  },
                }}
                fighter1Id={fight.fighter1.id}
                fighter2Id={fight.fighter2.id}
                fighter1Name={fight.fighter1.lastName}
                fighter2Name={fight.fighter2.lastName}
                onEdit={isPreFightLocked ? undefined : () => setIsEditingComment(true)}
                onUpvote={() => handleUpvoteComment(preFightCommentsData.userComment.id)}
                isUpvoting={upvotingCommentId === preFightCommentsData.userComment.id}
                isAuthenticated={isAuthenticated}
                showMyComment={true}
              />
            </View>
          )}

          {/* Display replies to user's own comment */}
          {preFightCommentsData.userComment && preFightCommentsData.userComment.replies && preFightCommentsData.userComment.replies.length > 0 && !isEditingComment && (() => {
            const userCommentReplies = preFightCommentsData.userComment.replies;
            const isExpanded = expandedReplies[preFightCommentsData.userComment.id] || false;
            const repliesToShow = isExpanded ? userCommentReplies : userCommentReplies.slice(0, INITIAL_REPLIES_SHOWN);
            const hiddenCount = userCommentReplies.length - INITIAL_REPLIES_SHOWN;

            return (
              <View style={{ marginLeft: 40, marginBottom: 0 }}>
                {repliesToShow.map((reply: any) => {
                  const isMyReply = reply.user?.id === user?.id;
                  return (
                    <React.Fragment key={reply.id}>
                      {!isPreFightLocked && editingReplyId === reply.id ? (
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
                                  backgroundColor: editReplyText.trim().length > 0 || reply.content ? colors.tint : colors.card,
                                  flex: 1,
                                }
                              ]}
                              disabled={editReplyMutation.isPending}
                              onPress={() => {
                                handleSaveReplyEdit(reply.id, reply.content);
                              }}
                            >
                              <Text style={[
                                styles.saveCommentButtonText,
                                { color: editReplyText.trim().length > 0 || reply.content ? '#000' : colors.text }
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
                            hypeRating: isMyReply ? selectedHype : reply.hypeRating,
                            predictedWinner: isMyReply ? selectedWinner : reply.predictedWinner,
                            predictedMethod: isMyReply ? selectedMethod : reply.predictedMethod,
                            upvotes: reply.upvotes || 0,
                            userHasUpvoted: reply.userHasUpvoted || false,
                            user: {
                              displayName: reply.user.displayName,
                            },
                          }}
                          fighter1Id={fight.fighter1.id}
                          fighter2Id={fight.fighter2.id}
                          fighter1Name={fight.fighter1.lastName}
                          fighter2Name={fight.fighter2.lastName}
                          onUpvote={() => handleUpvoteComment(reply.id)}
                          onFlag={() => handleFlagComment(reply.id)}
                          onEdit={isPreFightLocked ? undefined : (isMyReply ? () => {
                            setEditingReplyId(reply.id);
                            setEditReplyText(reply.content);
                          } : undefined)}
                          isUpvoting={upvotingCommentId === reply.id}
                          isAuthenticated={isAuthenticated}
                          showMyComment={isMyReply}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
                {/* Show more/less replies button */}
                {hiddenCount > 0 && (
                  <TouchableOpacity
                    onPress={() => setExpandedReplies(prev => ({ ...prev, [preFightCommentsData.userComment.id]: !isExpanded }))}
                    style={{ marginTop: -11, paddingVertical: 8, marginBottom: 5, alignSelf: 'flex-end' }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '500' }}>
                      {isExpanded ? 'Show less replies' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'reply' : 'replies'}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}

          {/* All other comments */}
          {preFightCommentsData.comments
            .filter((c: any) => c.id !== preFightCommentsData.userComment?.id)
            .map((comment: any) => {
              // Check if user has already replied to this comment
              const userHasReplied = comment.replies?.some((reply: any) => reply.user?.id === user?.id);

              return (
              <React.Fragment key={comment.id}>
                <View>
                  <PreFightCommentCard
                    comment={{
                      id: comment.id,
                      content: comment.content,
                      hypeRating: comment.hypeRating,
                      predictedWinner: comment.predictedWinner,
                      predictedMethod: comment.predictedMethod,
                      upvotes: comment.upvotes || 0,
                      userHasUpvoted: comment.userHasUpvoted || false,
                      user: {
                        displayName: comment.user.displayName,
                      },
                    }}
                    fighter1Id={fight.fighter1.id}
                    fighter2Id={fight.fighter2.id}
                    fighter1Name={fight.fighter1.lastName}
                    fighter2Name={fight.fighter2.lastName}
                    onUpvote={() => handleUpvoteComment(comment.id)}
                    onFlag={() => handleFlagComment(comment.id)}
                    onReply={isPreFightLocked || userHasReplied ? undefined : () => handleReplyClick(comment.id)}
                    isUpvoting={upvotingCommentId === comment.id}
                    isAuthenticated={isAuthenticated}
                    showMyComment={false}
                  />
                </View>

                {/* Reply form - shown when replying to this comment (only if not locked) */}
                {!isPreFightLocked && replyingToCommentId === comment.id && (
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
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                {comment.replies && comment.replies.length > 0 && (() => {
                  const isExpanded = expandedReplies[comment.id] || false;
                  const repliesToShow = isExpanded ? comment.replies : comment.replies.slice(0, INITIAL_REPLIES_SHOWN);
                  const hiddenCount = comment.replies.length - INITIAL_REPLIES_SHOWN;

                  return (
                    <View style={{ marginLeft: 40, marginTop: replyingToCommentId === comment.id ? 50 : 0, marginBottom: 0 }}>
                      {repliesToShow.map((reply: any) => {
                        const isMyReply = reply.user?.id === user?.id;
                        return (
                          <React.Fragment key={reply.id}>
                            {!isPreFightLocked && editingReplyId === reply.id ? (
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
                                        backgroundColor: editReplyText.trim().length > 0 || reply.content ? colors.tint : colors.card,
                                        flex: 1,
                                      }
                                    ]}
                                    disabled={editReplyMutation.isPending}
                                    onPress={() => {
                                      handleSaveReplyEdit(reply.id, reply.content);
                                    }}
                                  >
                                    <Text style={[
                                      styles.saveCommentButtonText,
                                      { color: editReplyText.trim().length > 0 || reply.content ? '#000' : colors.text }
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
                                  hypeRating: isMyReply ? selectedHype : reply.hypeRating,
                                  predictedWinner: isMyReply ? selectedWinner : reply.predictedWinner,
                                  predictedMethod: isMyReply ? selectedMethod : reply.predictedMethod,
                                  upvotes: reply.upvotes || 0,
                                  userHasUpvoted: reply.userHasUpvoted || false,
                                  user: {
                                    displayName: reply.user.displayName,
                                  },
                                }}
                                fighter1Id={fight.fighter1.id}
                                fighter2Id={fight.fighter2.id}
                                fighter1Name={fight.fighter1.lastName}
                                fighter2Name={fight.fighter2.lastName}
                                onUpvote={() => handleUpvoteComment(reply.id)}
                                onFlag={() => handleFlagComment(reply.id)}
                                onEdit={isPreFightLocked ? undefined : (isMyReply ? () => {
                                  setEditingReplyId(reply.id);
                                  setEditReplyText(reply.content);
                                } : undefined)}
                                isUpvoting={upvotingCommentId === reply.id}
                                isAuthenticated={isAuthenticated}
                                showMyComment={isMyReply}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                      {/* Show more/less replies button */}
                      {hiddenCount > 0 && (
                        <TouchableOpacity
                          onPress={() => setExpandedReplies(prev => ({ ...prev, [comment.id]: !isExpanded }))}
                          style={{ marginTop: -11, paddingVertical: 8, marginBottom: 5, alignSelf: 'flex-end' }}
                        >
                          <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '500' }}>
                            {isExpanded ? 'Show less replies' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'reply' : 'replies'}`}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })()}
              </React.Fragment>
            );
          })}
          </View>
        )}
      </SectionContainer>

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
        toastMessage={toastMessage}
        toastOpacity={toastOpacity}
        toastTranslateY={toastTranslateY}
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
    width: 100,
    height: 100,
    borderRadius: 50,
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
    height: 92,
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
  hypeWheelBoxContainer: {
    height: 92,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hypeWheelBox: {
    width: 48,
    height: 82,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  hypeWheelBoxText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    paddingVertical: 2,
    paddingHorizontal: 1.5,
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
