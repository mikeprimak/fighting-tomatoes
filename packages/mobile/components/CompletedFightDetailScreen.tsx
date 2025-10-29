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
  ActivityIndicator,
  TextInput,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQueryClient, useQuery, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { FlagReviewModal } from '.';
import { useAuth } from '../store/AuthContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from './CustomAlert';

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
  winner?: string | null;
  method?: string | null;
  round?: number | null;
  time?: string | null;
  averageRating: number;
  totalRatings?: number;
  userRating?: number;
  userReview?: any;
  userTags?: any[];
  userPredictedWinner?: string | null;
  userPredictedMethod?: string | null;
  userPredictedRound?: number | null;
  userHypePrediction?: number | null;
  topTags?: any[];
  ratings1?: number;
  ratings2?: number;
  ratings3?: number;
  ratings4?: number;
  ratings5?: number;
  ratings6?: number;
  ratings7?: number;
  ratings8?: number;
  ratings9?: number;
  ratings10?: number;
}

interface CompletedFightDetailScreenProps {
  fight: Fight;
  onRatingSuccess?: () => void;
}

// Comprehensive fight descriptors organized by rating tiers (from RateFightModal)
const ALL_FIGHT_TAGS = [
  // EXCELLENT FIGHTS (9-10)
  { id: 'masterpiece', name: 'Masterpiece', category: 'QUALITY', minRating: 9 },
  { id: 'legendary', name: 'Legendary', category: 'QUALITY', minRating: 9 },
  { id: 'instant-classic', name: 'Instant Classic', category: 'QUALITY', minRating: 9 },
  { id: 'fight-of-the-year', name: 'Fight of the Year', category: 'QUALITY', minRating: 9 },
  { id: 'epic', name: 'Epic', category: 'EMOTION', minRating: 9 },
  { id: 'spectacular', name: 'Spectacular', category: 'EMOTION', minRating: 9 },
  { id: 'jaw-dropping', name: 'Jaw-dropping', category: 'EMOTION', minRating: 9 },
  { id: 'incredible-comeback', name: 'Incredible Comeback', category: 'DRAMA', minRating: 9 },
  { id: 'perfect-technique', name: 'Perfect Technique', category: 'SKILL', minRating: 9 },
  { id: 'flawless-execution', name: 'Flawless Execution', category: 'SKILL', minRating: 9 },
  { id: 'submission-masterclass', name: 'Submission Masterclass', category: 'SKILL', minRating: 9 },
  { id: 'striking-clinic', name: 'Striking Clinic', category: 'SKILL', minRating: 9 },
  { id: 'heart-stopping', name: 'Heart-stopping', category: 'EMOTION', minRating: 9 },
  { id: 'artistic', name: 'Artistic', category: 'STYLE', minRating: 9 },

  // GREAT FIGHTS (7-8)
  { id: 'exciting', name: 'Exciting', category: 'EMOTION', minRating: 7 },
  { id: 'thrilling', name: 'Thrilling', category: 'EMOTION', minRating: 7 },
  { id: 'entertaining', name: 'Entertaining', category: 'EMOTION', minRating: 7 },
  { id: 'fight-of-the-night', name: 'Fight of the Night', category: 'QUALITY', minRating: 7 },
  { id: 'back-and-forth', name: 'Back and Forth', category: 'PACE', minRating: 7 },
  { id: 'war', name: 'War', category: 'STYLE', minRating: 7 },
  { id: 'barn-burner', name: 'Barn Burner', category: 'PACE', minRating: 7 },
  { id: 'comeback', name: 'Comeback', category: 'DRAMA', minRating: 7 },
  { id: 'upset', name: 'Upset', category: 'OUTCOME', minRating: 7 },
  { id: 'technical', name: 'Technical', category: 'STYLE', minRating: 7 },
  { id: 'high-level', name: 'High Level', category: 'SKILL', minRating: 7 },
  { id: 'fast-paced', name: 'Fast Paced', category: 'PACE', minRating: 7 },
  { id: 'explosive', name: 'Explosive', category: 'PACE', minRating: 7 },
  { id: 'dramatic', name: 'Dramatic', category: 'DRAMA', minRating: 7 },
  { id: 'intense', name: 'Intense', category: 'EMOTION', minRating: 7 },
  { id: 'knockout', name: 'Knockout', category: 'OUTCOME', minRating: 7 },
  { id: 'submission', name: 'Submission', category: 'OUTCOME', minRating: 7 },
  { id: 'striking', name: 'Striking', category: 'STYLE', minRating: 7 },
  { id: 'grappling', name: 'Grappling', category: 'STYLE', minRating: 7 },

  // GOOD FIGHTS (5-6)
  { id: 'solid', name: 'Solid', category: 'QUALITY', minRating: 5 },
  { id: 'decent', name: 'Decent', category: 'QUALITY', minRating: 5 },
  { id: 'competitive', name: 'Competitive', category: 'QUALITY', minRating: 5 },
  { id: 'close', name: 'Close', category: 'OUTCOME', minRating: 5 },
  { id: 'decision', name: 'Decision', category: 'OUTCOME', minRating: 5 },
  { id: 'tactical', name: 'Tactical', category: 'STYLE', minRating: 5 },
  { id: 'methodical', name: 'Methodical', category: 'STYLE', minRating: 5 },
  { id: 'grinding', name: 'Grinding', category: 'STYLE', minRating: 5 },
  { id: 'chess-match', name: 'Chess Match', category: 'STYLE', minRating: 5 },
  { id: 'measured', name: 'Measured', category: 'PACE', minRating: 5 },
  { id: 'patient', name: 'Patient', category: 'STYLE', minRating: 5 },
  { id: 'workmanlike', name: 'Workmanlike', category: 'STYLE', minRating: 5 },
  { id: 'steady', name: 'Steady', category: 'PACE', minRating: 5 },
  { id: 'professional', name: 'Professional', category: 'STYLE', minRating: 5 },
  { id: 'momentum-shifts', name: 'Momentum Shifts', category: 'DRAMA', minRating: 5 },

  // POOR FIGHTS (4 and below)
  { id: 'disappointing', name: 'Disappointing', category: 'EMOTION', maxRating: 4 },
  { id: 'boring', name: 'Boring', category: 'EMOTION', maxRating: 4 },
  { id: 'slow', name: 'Slow', category: 'PACE', maxRating: 4 },
  { id: 'uneventful', name: 'Uneventful', category: 'EMOTION', maxRating: 4 },
  { id: 'lackluster', name: 'Lackluster', category: 'QUALITY', maxRating: 4 },
  { id: 'sloppy', name: 'Sloppy', category: 'SKILL', maxRating: 4 },
  { id: 'low-energy', name: 'Low Energy', category: 'PACE', maxRating: 4 },
  { id: 'tentative', name: 'Tentative', category: 'STYLE', maxRating: 4 },
  { id: 'stalling', name: 'Stalling', category: 'STYLE', maxRating: 4 },
  { id: 'point-fighting', name: 'Point Fighting', category: 'STYLE', maxRating: 4 },
  { id: 'one-sided', name: 'One-sided', category: 'OUTCOME', maxRating: 4 },
  { id: 'mismatch', name: 'Mismatch', category: 'OUTCOME', maxRating: 4 },
  { id: 'early-stoppage', name: 'Early Stoppage', category: 'CONTROVERSY', maxRating: 4 },
  { id: 'bad-referee', name: 'Bad Referee', category: 'CONTROVERSY', maxRating: 4 },
  { id: 'controversial', name: 'Controversial', category: 'CONTROVERSY', maxRating: 4 },
  { id: 'flat', name: 'Flat', category: 'EMOTION', maxRating: 4 },

  // UNIVERSAL TAGS
  { id: 'emotional', name: 'Emotional', category: 'EMOTION' },
  { id: 'heavyweight', name: 'Heavyweight', category: 'DIVISION' },
  { id: 'title-fight', name: 'Title Fight', category: 'STAKES' },
  { id: 'main-event', name: 'Main Event', category: 'STAKES' },
  { id: 'veteran', name: 'Veteran', category: 'FIGHTER' },
  { id: 'prospect', name: 'Prospect', category: 'FIGHTER' },
  { id: 'debut', name: 'Debut', category: 'STAKES' },
  { id: 'retirement', name: 'Retirement', category: 'STAKES' },
  { id: 'grudge-match', name: 'Grudge Match', category: 'STAKES' },
  { id: 'rematch', name: 'Rematch', category: 'STAKES' },
  { id: 'ground-game', name: 'Ground Game', category: 'STYLE' },
  { id: 'clinch-work', name: 'Clinch Work', category: 'STYLE' },
  { id: 'cardio', name: 'Cardio', category: 'SKILL' },
  { id: 'heart', name: 'Heart', category: 'EMOTION' },
  { id: 'skill-gap', name: 'Skill Gap', category: 'SKILL' },
  { id: 'size-advantage', name: 'Size Advantage', category: 'PHYSICAL' },
  { id: 'reach-advantage', name: 'Reach Advantage', category: 'PHYSICAL' },
  { id: 'age-factor', name: 'Age Factor', category: 'PHYSICAL' },
  { id: 'injury', name: 'Injury', category: 'PHYSICAL' },
  { id: 'crowd-favorite', name: 'Crowd Favorite', category: 'ATMOSPHERE' },
  { id: 'home-crowd', name: 'Home Crowd', category: 'ATMOSPHERE' },
];

// Function to shuffle array randomly
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Function to get available tags based on rating
const getAvailableTagsForRating = (rating: number, selectedTags: string[]) => {
  let eligibleTags: typeof ALL_FIGHT_TAGS = [];

  if (rating >= 9) {
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      tag.minRating === 9 || (!tag.minRating && !tag.maxRating)
    );
  } else if (rating >= 7) {
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      tag.minRating === 7 || (!tag.minRating && !tag.maxRating)
    );
  } else if (rating >= 5) {
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      tag.minRating === 5 || (!tag.minRating && !tag.maxRating)
    );
  } else if (rating >= 1) {
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      tag.maxRating === 4 || (!tag.minRating && !tag.maxRating)
    );
  } else {
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      !tag.minRating && !tag.maxRating
    );
  }

  // Include already selected tags
  const selectedTagObjects = ALL_FIGHT_TAGS.filter(tag => selectedTags.includes(tag.id));
  const mustIncludeTags = selectedTagObjects;

  // Remove selected tags from pool
  const unselectedEligibleTags = eligibleTags.filter(tag => !selectedTags.includes(tag.id));

  // Limit to 7 tags for clean layout
  const CONSERVATIVE_MAX_TAGS = 7;
  const selectedCount = mustIncludeTags.length;
  const remainingSlots = Math.max(0, Math.min(CONSERVATIVE_MAX_TAGS - selectedCount, unselectedEligibleTags.length));

  let randomlySelectedTags: typeof ALL_FIGHT_TAGS = [];
  if (remainingSlots > 0 && unselectedEligibleTags.length > 0) {
    const shuffled = shuffleArray(unselectedEligibleTags);
    randomlySelectedTags = shuffled.slice(0, remainingSlots);
  }

  const allTags = [...mustIncludeTags, ...randomlySelectedTags];
  return allTags.slice(0, CONSERVATIVE_MAX_TAGS);
};

// Placeholder image selection for fighters
const getFighterPlaceholderImage = (fighterId: string) => {
  const images = [
    require('../assets/fighters/fighter-1.jpg'),
    require('../assets/fighters/fighter-2.jpg'),
    require('../assets/fighters/fighter-3.jpg'),
    require('../assets/fighters/fighter-4.jpg'),
    require('../assets/fighters/fighter-5.jpg'),
    require('../assets/fighters/fighter-6.jpg'),
  ];
  const lastCharCode = fighterId.charCodeAt(fighterId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export default function CompletedFightDetailScreen({ fight, onRatingSuccess }: CompletedFightDetailScreenProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, refreshUserData } = useAuth();
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();

  const [animateMyRating, setAnimateMyRating] = useState(false);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [reviewToFlag, setReviewToFlag] = useState<string | null>(null);

  // Inline rating state
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagRandomSeed, setTagRandomSeed] = useState(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Animation values for wheel animation (large star display)
  const wheelAnimation = useRef(new Animated.Value(1200)).current;
  const starColorAnimation = useRef(new Animated.Value(0)).current;

  // Animation values for My Rating
  const myRatingScaleAnim = useRef(new Animated.Value(1)).current;
  const myRatingGlowAnim = useRef(new Animated.Value(0)).current;
  const star1 = useRef(new Animated.Value(0)).current;
  const star2 = useRef(new Animated.Value(0)).current;
  const star3 = useRef(new Animated.Value(0)).current;
  const star4 = useRef(new Animated.Value(0)).current;
  const star5 = useRef(new Animated.Value(0)).current;
  const star6 = useRef(new Animated.Value(0)).current;
  const star7 = useRef(new Animated.Value(0)).current;
  const star8 = useRef(new Animated.Value(0)).current;

  // Fetch prediction stats
  const { data: predictionStats } = useQuery({
    queryKey: ['fightPredictionStats', fight.id],
    queryFn: () => apiService.getFightPredictionStats(fight.id),
    enabled: !!fight.id,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  // Fetch aggregate stats
  const { data: aggregateStats } = useQuery({
    queryKey: ['fightAggregateStats', fight.id],
    queryFn: () => apiService.getFightAggregateStats(fight.id),
    enabled: !!fight.id,
    staleTime: 60 * 1000,
  });

  // Fetch tags
  const { data: tagsData } = useQuery({
    queryKey: ['fightTags', fight.id],
    queryFn: () => apiService.getFightTags(fight.id),
    enabled: !!fight.id && !!isAuthenticated,
  });

  // Fetch reviews with infinite scroll
  const {
    data: reviewsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['fightReviews', fight.id],
    queryFn: ({ pageParam = 1 }) =>
      apiService.getFightReviews(fight.id, { page: pageParam, limit: 10 }),
    enabled: !!fight.id,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    staleTime: 30 * 1000,
  });

  // Calculate available tags based on current rating
  const availableTags = React.useMemo(() => {
    return getAvailableTagsForRating(rating, selectedTags);
  }, [rating, tagRandomSeed]);

  // Mutation for auto-saving rating/review/tags
  const updateUserDataMutation = useMutation({
    mutationFn: async (data: { rating: number | null; review: string | null; tags: string[]; }) => {
      return await apiService.updateFightUserData(fight.id, data);
    },
    onSuccess: async () => {
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightTags', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightReviews', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightAggregateStats', fight.id] });

      // Refresh user stats
      await refreshUserData();

      // Reveal spoiler when user rates
      setSpoilerRevealed(true);

      // Trigger animation
      setTimeout(() => {
        setAnimateMyRating(true);
      }, 300);

      onRatingSuccess?.();
    },
    onError: (error: any) => {
      console.error('Update error:', error);
      showError(error?.error || 'Failed to save data', 'Error');
    },
  });

  // Upvote mutation
  const upvoteMutation = useMutation({
    mutationFn: ({ reviewId }: { reviewId: string }) =>
      apiService.toggleReviewUpvote(fight.id, reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fightReviews', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
    },
  });

  // Flag review mutation
  const flagReviewMutation = useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: string; reason: string }) =>
      apiService.flagReview(fight.id, reviewId, reason),
    onSuccess: () => {
      showSuccess('Review has been flagged for moderation');
      setFlagModalVisible(false);
      setReviewToFlag(null);
    },
    onError: (error: any) => {
      showError(error?.error || 'Failed to flag review');
    },
  });

  const handleFlagReview = (reviewId: string) => {
    setReviewToFlag(reviewId);
    setFlagModalVisible(true);
  };

  const submitFlagReview = (reason: string) => {
    if (reviewToFlag) {
      flagReviewMutation.mutate({ reviewId: reviewToFlag, reason });
    }
  };

  // Initialize inline rating form with existing data
  useEffect(() => {
    // Extract existing data
    let currentRating = 0;
    let currentComment = '';
    let currentTags: string[] = [];

    // Check for review data
    if (fight.userReview) {
      currentRating = fight.userReview.rating || 0;
      currentComment = fight.userReview.content || '';
    } else if (fight.userRating) {
      currentRating = typeof fight.userRating === 'number'
        ? fight.userRating
        : (fight.userRating.rating || 0);
    }

    // Extract existing tags (check both fight.userTags and tagsData)
    const userTags = fight.userTags || tagsData?.userTags || [];
    if (userTags && userTags.length > 0) {
      currentTags = userTags.map((userTag: any) => {
        const tagName = typeof userTag === 'string'
          ? userTag.toLowerCase()
          : (userTag.tag?.name || userTag.name || '').toLowerCase();

        const frontendTag = ALL_FIGHT_TAGS.find(tag =>
          tag.name.toLowerCase() === tagName ||
          tag.id.toLowerCase() === tagName
        );
        return frontendTag?.id;
      }).filter(Boolean) as string[];
    }

    // Initialize state
    setRating(currentRating);
    setComment(currentComment);
    setSelectedTags(currentTags);
    setTagRandomSeed(Math.floor(Math.random() * 1000));

    // Initialize wheel animation
    if (currentRating > 0) {
      const wheelPosition = (10 - currentRating) * 120;
      wheelAnimation.setValue(wheelPosition);
      starColorAnimation.setValue(1);
    } else {
      wheelAnimation.setValue(1200);
      starColorAnimation.setValue(0);
    }
  }, [fight.id, fight.userReview, fight.userRating, fight.userTags, tagsData]);

  // Auto-save handler
  const handleAutoSave = React.useCallback(() => {
    // Don't save if comment exists but no rating
    if (comment.trim() && rating === 0) {
      showError('Reviews require a rating.', 'Error');
      return;
    }

    const submissionData = {
      rating: rating > 0 ? rating : null,
      review: comment.trim() || null,
      tags: selectedTags
    };

    updateUserDataMutation.mutate(submissionData);
  }, [rating, comment, selectedTags]);

  // Debounced auto-save for comment changes
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only trigger auto-save if there's actual data to save
    if (rating > 0 || comment.trim() || selectedTags.length > 0) {
      debounceTimerRef.current = setTimeout(() => {
        handleAutoSave();
      }, 1000); // 1 second debounce for comment
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [comment]);

  // Animation function to move wheel to specific number
  const animateToNumber = (targetNumber: number) => {
    if (targetNumber === 0) {
      // Animate to blank position (below "1")
      wheelAnimation.stopAnimation();
      Animated.timing(wheelAnimation, {
        toValue: 1200,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else {
      // Calculate position for target number (10 at top, 1 at bottom)
      const targetPosition = (10 - targetNumber) * 120;

      wheelAnimation.stopAnimation();
      Animated.timing(wheelAnimation, {
        toValue: targetPosition,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  };

  // Handlers for rating and tags (immediate save)
  const handleSetRating = (newRating: number) => {
    const finalRating = rating === newRating ? 0 : newRating;
    setRating(finalRating);
    setTagRandomSeed(prev => prev + 1);

    // Trigger wheel animation
    animateToNumber(finalRating);

    // Animate star color transition
    Animated.timing(starColorAnimation, {
      toValue: finalRating > 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();

    // Delay save until after animation completes (800ms animation + 100ms buffer)
    setTimeout(() => {
      const submissionData = {
        rating: finalRating > 0 ? finalRating : null,
        review: comment.trim() || null,
        tags: selectedTags
      };
      updateUserDataMutation.mutate(submissionData);
    }, 900);
  };

  const handleToggleTag = (tagId: string) => {
    const newTags = selectedTags.includes(tagId)
      ? selectedTags.filter(id => id !== tagId)
      : [...selectedTags, tagId];

    setSelectedTags(newTags);

    // Immediate save for tags
    setTimeout(() => {
      const submissionData = {
        rating: rating > 0 ? rating : null,
        review: comment.trim() || null,
        tags: newTags
      };
      updateUserDataMutation.mutate(submissionData);
    }, 100);
  };

  // Trigger animation when rating is submitted
  useEffect(() => {
    if (animateMyRating) {
      // Reset all animations
      star1.setValue(0);
      star2.setValue(0);
      star3.setValue(0);
      star4.setValue(0);
      star5.setValue(0);
      star6.setValue(0);
      star7.setValue(0);
      star8.setValue(0);
      myRatingScaleAnim.setValue(1);
      myRatingGlowAnim.setValue(0);

      // Start animations
      Animated.parallel([
        // Scale and glow the rating card
        Animated.sequence([
          Animated.timing(myRatingScaleAnim, {
            toValue: 1.1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(myRatingScaleAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(myRatingGlowAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(myRatingGlowAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        // Stars
        Animated.stagger(80, [
          Animated.timing(star1, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star2, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star3, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star4, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star5, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star6, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star7, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(star8, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      ]).start();

      // Reset animation flag after animation completes
      setTimeout(() => setAnimateMyRating(false), 1000);
    }
  }, [animateMyRating]);

  // Helper function to format weight class
  const formatWeightClass = (weightClass: string) => {
    return weightClass
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Determine which rings to show for each fighter
  const getFighterRings = (fighterId: string, fighterName: string, isFighter2: boolean) => {
    const rings = [];

    // Green ring - actual winner (only show if user has rated OR revealed the winner)
    if (fight.winner === fighterId && (fight.userRating || spoilerRevealed)) {
      rings.push('winner');
    }

    // Community prediction ring - yellow for fighter1, gold for fighter2
    if (aggregateStats?.communityPrediction?.winner === fighterName) {
      rings.push(isFighter2 ? 'community-gold' : 'community');
    }

    // Blue ring - user's prediction
    if (aggregateStats?.userPrediction?.winner === fighterName) {
      rings.push('user');
    }

    return rings;
  };

  // Calculate rating distribution
  const ratingDistribution: Record<number, number> = {
    1: fight.ratings1 || 0,
    2: fight.ratings2 || 0,
    3: fight.ratings3 || 0,
    4: fight.ratings4 || 0,
    5: fight.ratings5 || 0,
    6: fight.ratings6 || 0,
    7: fight.ratings7 || 0,
    8: fight.ratings8 || 0,
    9: fight.ratings9 || 0,
    10: fight.ratings10 || 0,
  };
  const totalRatings = fight.totalRatings || 0;
  const maxCount = Math.max(...Object.values(ratingDistribution), 1);


  return (
    <>
      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]}>
        {/* Fighter Matchup - Clickable */}
        <View style={styles.matchupContainer}>
          {/* Fighter 1 */}
          <TouchableOpacity
            style={styles.fighterContainer}
            onPress={() => router.push(`/fighter/${fight.fighter1.id}`)}
          >
            {(() => {
              const fighter1Rings = getFighterRings(
                fight.fighter1.id,
                `${fight.fighter1.firstName} ${fight.fighter1.lastName}`,
                false
              );
              const borderWidth = 3;
              const gap = 2;
              const baseSize = 125;

              return (
                <View style={{ width: baseSize, height: baseSize, marginBottom: 12, position: 'relative' }}>
                  {fighter1Rings.map((ring, index) => {
                    const ringColor = ring === 'winner' ? '#22c55e' : ring === 'community' ? '#F5C518' : ring === 'community-gold' ? '#8A7014' : '#83B4F3';
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
                          borderRadius: baseSize / 2,
                          zIndex: index,
                        }}
                      />
                    );
                  })}

                  <Image
                    source={
                      fight.fighter1.profileImage
                        ? { uri: fight.fighter1.profileImage }
                        : getFighterPlaceholderImage(fight.fighter1.id)
                    }
                    style={{
                      width: baseSize,
                      height: baseSize,
                      borderRadius: baseSize / 2,
                      zIndex: 100,
                    }}
                  />
                </View>
              );
            })()}
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fight.fighter1.firstName} {fight.fighter1.lastName}
            </Text>
            {fight.fighter1.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]}>
                "{fight.fighter1.nickname}"
              </Text>
            )}
            {fight.fighter1Odds && (
              <Text style={[styles.fighterRecord, { color: colors.textSecondary }]} numberOfLines={1}>
                {fight.fighter1Odds} ({(() => {
                  const odds = parseInt(fight.fighter1Odds);
                  if (odds <= -400) return 'Massive Favorite';
                  if (odds <= -200) return 'Heavy Favorite';
                  if (odds < -110) return 'Favorite';
                  if (odds <= 110) return 'Even';
                  if (odds <= 200) return 'Minor Underdog';
                  if (odds <= 400) return 'Underdog';
                  return 'Major Underdog';
                })()})
              </Text>
            )}
          </TouchableOpacity>

          {/* VS Divider */}
          <View style={styles.vsContainer}>
            <Text style={[styles.vsText, { color: colors.textSecondary }]}>VS</Text>
          </View>

          {/* Fighter 2 */}
          <TouchableOpacity
            style={styles.fighterContainer}
            onPress={() => router.push(`/fighter/${fight.fighter2.id}`)}
          >
            {(() => {
              const fighter2Rings = getFighterRings(
                fight.fighter2.id,
                `${fight.fighter2.firstName} ${fight.fighter2.lastName}`,
                true
              );
              const borderWidth = 3;
              const gap = 2;
              const baseSize = 125;

              return (
                <View style={{ width: baseSize, height: baseSize, marginBottom: 12, position: 'relative' }}>
                  {fighter2Rings.map((ring, index) => {
                    const ringColor = ring === 'winner' ? '#22c55e' : ring === 'community' ? '#F5C518' : ring === 'community-gold' ? '#8A7014' : '#83B4F3';
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
                          borderRadius: baseSize / 2,
                          zIndex: index,
                        }}
                      />
                    );
                  })}

                  <Image
                    source={
                      fight.fighter2.profileImage
                        ? { uri: fight.fighter2.profileImage }
                        : getFighterPlaceholderImage(fight.fighter2.id)
                    }
                    style={{
                      width: baseSize,
                      height: baseSize,
                      borderRadius: baseSize / 2,
                      zIndex: 100,
                    }}
                  />
                </View>
              );
            })()}
            <Text style={[styles.fighterName, { color: colors.text }]}>
              {fight.fighter2.firstName} {fight.fighter2.lastName}
            </Text>
            {fight.fighter2.nickname && (
              <Text style={[styles.fighterNickname, { color: colors.textSecondary }]}>
                "{fight.fighter2.nickname}"
              </Text>
            )}
            {fight.fighter2Odds && (
              <Text style={[styles.fighterRecord, { color: colors.textSecondary }]} numberOfLines={1}>
                {fight.fighter2Odds} ({(() => {
                  const odds = parseInt(fight.fighter2Odds);
                  if (odds <= -400) return 'Massive Favorite';
                  if (odds <= -200) return 'Heavy Favorite';
                  if (odds < -110) return 'Favorite';
                  if (odds <= 110) return 'Even';
                  if (odds <= 200) return 'Minor Underdog';
                  if (odds <= 400) return 'Underdog';
                  return 'Major Underdog';
                })()})
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Outcome (winner/method) */}
        {fight.winner && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.outcomeContainer}>
              {!fight.userRating && !spoilerRevealed ? (
                // Spoiler protection - hidden view
                <View style={styles.spoilerRow}>
                  <Text style={[styles.winnerText, { color: colors.text }]}>
                    Winner:
                  </Text>
                  <TouchableOpacity
                    style={[styles.revealButton, { backgroundColor: '#83B4F3' }]}
                    onPress={() => setSpoilerRevealed(true)}
                  >
                    <Text style={[styles.revealButtonText, { color: '#000' }]}>Reveal Winner</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                // Normal view (rated or revealed)
                <Text style={[styles.winnerText, { color: colors.text }]}>
                  Winner: {fight.winner === fight.fighter1.id
                    ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
                    : fight.winner === fight.fighter2.id
                    ? `${fight.fighter2.firstName} ${fight.fighter2.lastName}`
                    : fight.winner}
                  {fight.method && ` by ${fight.method}`}
                  {fight.round && ` in Round ${fight.round}`}
                  {fight.time && ` (${fight.time})`}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Inline Rating Section */}
        <View style={[styles.section, { backgroundColor: 'transparent', borderWidth: 0 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Rate This Fight</Text>

          {/* Large display star with wheel animation */}
          <View style={styles.displayStarContainer}>
            <View style={styles.animatedStarContainer}>
              <View style={{ position: 'relative', marginTop: 24 }}>
                {/* Grey star (base layer) */}
                <FontAwesome name="star" size={80} color="#666666" />
                {/* Primary color star (overlay) */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    opacity: starColorAnimation
                  }}
                >
                  <FontAwesome name="star" size={80} color={colors.primary} />
                </Animated.View>
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
                  colors={[colors.card, `${colors.card}DD`, `${colors.card}99`, `${colors.card}44`, 'transparent']}
                  style={[styles.fadeOverlay, { top: 0, height: 38 }]}
                  pointerEvents="none"
                />

                {/* Smooth bottom gradient fade */}
                <LinearGradient
                  colors={['transparent', `${colors.card}44`, `${colors.card}99`, `${colors.card}DD`, colors.card, colors.card]}
                  style={[styles.fadeOverlay, { bottom: -12, height: 25 }]}
                  pointerEvents="none"
                />
              </View>
            </View>
          </View>

          {/* Star Rating (1-10) */}
          <View style={styles.inlineStarContainer}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
              <TouchableOpacity
                key={level}
                onPress={() => handleSetRating(level)}
                style={styles.inlineStarButton}
              >
                <FontAwesome
                  name="star"
                  size={32}
                  color={level <= rating ? colors.primary : '#666666'}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Tags */}
          {rating > 0 && availableTags.length > 0 && (
            <View style={styles.inlineTagsSection}>
              <View style={styles.inlineTagsContainer}>
                {availableTags.map((tag) => (
                  <TouchableOpacity
                    key={tag.id}
                    onPress={() => handleToggleTag(tag.id)}
                    style={[
                      styles.inlineTagButton,
                      {
                        backgroundColor: selectedTags.includes(tag.id) ? colors.primary : colors.background,
                        borderColor: colors.border,
                      }
                    ]}
                  >
                    <Text style={[
                      styles.inlineTagText,
                      {
                        color: selectedTags.includes(tag.id) ? colors.textOnAccent : colors.text
                      }
                    ]}>
                      {tag.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Comment/Review */}
          <View style={styles.inlineCommentSection}>
            <TextInput
              style={[
                styles.inlineCommentInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text
                }
              ]}
              placeholder="Write a review... (optional)"
              placeholderTextColor={colors.textSecondary}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Auto-save indicator */}
          {updateUserDataMutation.isPending && (
            <View style={styles.savingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.savingText, { color: colors.textSecondary }]}>
                Saving...
              </Text>
            </View>
          )}
        </View>

        {/* Split Score Row */}
        <View style={styles.splitScoreRow}>
          {/* Aggregate Rating - Left */}
          <View style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FontAwesome name="star" size={48} color="#F5C518" />
            <Text style={[styles.halfScoreValue, { color: colors.text }]}>
              {fight.averageRating
                ? fight.averageRating % 1 === 0
                  ? fight.averageRating.toString()
                  : fight.averageRating.toFixed(1)
                : '0'}
            </Text>
            <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
              Average Rating
            </Text>
            <Text style={[styles.halfScoreSubLabel, { color: colors.textSecondary }]}>
              ({totalRatings} {totalRatings === 1 ? 'rating' : 'ratings'})
            </Text>
          </View>

          {/* My Rating - Right */}
          <View
            style={[styles.halfScoreContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Animated.View
              style={[
                styles.myRatingContent,
                {
                  transform: [{ scale: myRatingScaleAnim }],
                  opacity: myRatingGlowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.8],
                  }),
                },
              ]}
            >
              <FontAwesome name={fight.userRating ? "star" : "star-o"} size={48} color="#83B4F3" />
              <Text style={[styles.halfScoreValue, { color: colors.text }]}>
                {fight.userRating || ''}
              </Text>
              <Text style={[styles.halfScoreLabel, { color: colors.textSecondary }]}>
                My Rating
              </Text>

              {/* Star sparkles - 8 stars */}
              {fight.userRating && (
                <>
                  {/* Top-right star */}
                  <Animated.View style={[
                    styles.sparkle,
                    {
                      top: -10,
                      right: -10,
                      opacity: star1.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0],
                      }),
                      transform: [
                        { scale: star1.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                        { translateX: star1.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                        { translateY: star1.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                      ],
                    }
                  ]}>
                    <FontAwesome name="star" size={12} color="#83B4F3" />
                  </Animated.View>

                  {/* Top-left star */}
                  <Animated.View style={[
                    styles.sparkle,
                    {
                      top: -10,
                      left: -10,
                      opacity: star2.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0],
                      }),
                      transform: [
                        { scale: star2.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                        { translateX: star2.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                        { translateY: star2.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                      ],
                    }
                  ]}>
                    <FontAwesome name="star" size={12} color="#83B4F3" />
                  </Animated.View>

                  {/* Bottom-right star */}
                  <Animated.View style={[
                    styles.sparkle,
                    {
                      bottom: -10,
                      right: -10,
                      opacity: star3.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0],
                      }),
                      transform: [
                        { scale: star3.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                        { translateX: star3.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                        { translateY: star3.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                      ],
                    }
                  ]}>
                    <FontAwesome name="star" size={12} color="#83B4F3" />
                  </Animated.View>

                  {/* Bottom-left star */}
                  <Animated.View style={[
                    styles.sparkle,
                    {
                      bottom: -10,
                      left: -10,
                      opacity: star4.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0],
                      }),
                      transform: [
                        { scale: star4.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                        { translateX: star4.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) },
                        { translateY: star4.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
                      ],
                    }
                  ]}>
                    <FontAwesome name="star" size={12} color="#83B4F3" />
                  </Animated.View>

                  {/* Top center star */}
                  <Animated.View style={[
                    styles.sparkle,
                    {
                      top: -10,
                      left: '50%',
                      marginLeft: -6,
                      opacity: star5.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0],
                      }),
                      transform: [
                        { scale: star5.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                        { translateY: star5.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                      ],
                    }
                  ]}>
                    <FontAwesome name="star" size={12} color="#83B4F3" />
                  </Animated.View>

                  {/* Right center star */}
                  <Animated.View style={[
                    styles.sparkle,
                    {
                      top: 2,
                      right: -10,
                      opacity: star6.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0],
                      }),
                      transform: [
                        { translateY: 0 },
                        { translateX: star6.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                        { scale: star6.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                      ],
                    }
                  ]}>
                    <FontAwesome name="star" size={12} color="#83B4F3" />
                  </Animated.View>

                  {/* Bottom center star */}
                  <Animated.View style={[
                    styles.sparkle,
                    {
                      bottom: -10,
                      left: '50%',
                      marginLeft: -6,
                      opacity: star7.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0],
                      }),
                      transform: [
                        { scale: star7.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                        { translateY: star7.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) },
                      ],
                    }
                  ]}>
                    <FontAwesome name="star" size={12} color="#83B4F3" />
                  </Animated.View>

                  {/* Left center star */}
                  <Animated.View style={[
                    styles.sparkle,
                    {
                      top: 2,
                      left: -10,
                      opacity: star8.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 1, 0],
                      }),
                      transform: [
                        { translateY: 0 },
                        { translateX: star8.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                        { scale: star8.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                      ],
                    }
                  ]}>
                    <FontAwesome name="star" size={12} color="#83B4F3" />
                  </Animated.View>
                </>
              )}
            </Animated.View>
          </View>
        </View>

        {/* Fight Details */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Fight Details</Text>

          {/* Event Name */}
          {fight.event?.name && (
            <View style={styles.infoRow}>
              <FontAwesome name="calendar" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {fight.event.name}
              </Text>
            </View>
          )}

          {/* Event Date */}
          {fight.event?.date && (
            <View style={styles.infoRow}>
              <FontAwesome name="calendar-o" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {new Date(fight.event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
              </Text>
            </View>
          )}

          {/* Fighter 1 Stats */}
          <View style={styles.infoRow}>
            <FontAwesome name="user" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {fight.fighter1.firstName} {fight.fighter1.lastName}: {fight.fighter1.wins}-{fight.fighter1.losses}-{fight.fighter1.draws}
              {fight.fighter1Ranking && fight.weightClass && ` (#${fight.fighter1Ranking} ${formatWeightClass(fight.weightClass)})`}
            </Text>
          </View>

          {/* Fighter 2 Stats */}
          <View style={styles.infoRow}>
            <FontAwesome name="user" size={16} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              {fight.fighter2.firstName} {fight.fighter2.lastName}: {fight.fighter2.wins}-{fight.fighter2.losses}-{fight.fighter2.draws}
              {fight.fighter2Ranking && fight.weightClass && ` (#${fight.fighter2Ranking} ${formatWeightClass(fight.weightClass)})`}
            </Text>
          </View>

          {/* Weight Class */}
          {fight.weightClass && (
            <View style={styles.infoRow}>
              <FontAwesome name="trophy" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {fight.isTitle ? `${formatWeightClass(fight.weightClass)} Championship` : formatWeightClass(fight.weightClass)}
              </Text>
            </View>
          )}

          {/* Event Location */}
          {fight.event?.location && (
            <View style={styles.infoRow}>
              <FontAwesome name="map-marker" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {fight.event.location}
              </Text>
            </View>
          )}

          {/* Arena/Venue */}
          {fight.event?.venue && (
            <View style={styles.infoRow}>
              <FontAwesome name="building-o" size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {fight.event.venue}
              </Text>
            </View>
          )}
        </View>

        {/* Rating Distribution */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Rating Distribution
          </Text>
          <View style={styles.distributionContainer}>
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => {
              const count = ratingDistribution[score] || 0;
              const percentage = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
              const barWidth = totalRatings > 0 ? (count / maxCount) * 100 : 0;

              return (
                <View key={score} style={styles.distributionRow}>
                  <Text style={[styles.distributionScore, { color: colors.text }]}>{score}</Text>
                  <View style={styles.distributionBarContainer}>
                    <View
                      style={[
                        styles.distributionBar,
                        {
                          width: `${barWidth}%`,
                          backgroundColor: '#F5C518',
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.distributionCount, { color: colors.textSecondary }]}>
                    {count} ({percentage.toFixed(0)}%)
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* My Pre-Fight Prediction */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>My Prediction</Text>
          {(fight.userPredictedWinner || fight.userPredictedMethod || fight.userPredictedRound || fight.userHypePrediction) ? (
            <Text style={[styles.myPredictionText, { color: colors.text }]}>
              {fight.userPredictedWinner && (
                <>
                  {fight.userPredictedWinner === fight.fighter1.id
                    ? `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
                    : `${fight.fighter2.firstName} ${fight.fighter2.lastName}`}
                </>
              )}
              {fight.userPredictedMethod && (
                <> by {fight.userPredictedMethod === 'DECISION' ? 'Decision' : fight.userPredictedMethod === 'KO_TKO' ? 'KO/TKO' : 'Submission'}</>
              )}
              {fight.userPredictedRound && (
                <> in Round {fight.userPredictedRound}</>
              )}
              {fight.userHypePrediction && (
                <> (Hype: {fight.userHypePrediction}/10)</>
              )}
            </Text>
          ) : (
            <Text style={[styles.noPredictionText, { color: colors.textSecondary }]}>
              You did not make a prediction for this fight.
            </Text>
          )}
        </View>

        {/* Community Pre-Fight Predictions */}
        {predictionStats && predictionStats.totalPredictions > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Community Predictions</Text>

            {/* Winner Predictions */}
            <View style={styles.predictionSubSection}>
              <View style={styles.splitBarContainer}>
                {/* Fighter names above bar */}
                <View style={styles.fighterNamesRow}>
                  <Text style={[styles.fighterNameLeft, { color: colors.text }]} numberOfLines={1}>
                    {predictionStats.winnerPredictions.fighter1.name}
                  </Text>
                  <Text style={[styles.fighterNameRight, { color: colors.text }]} numberOfLines={1}>
                    {predictionStats.winnerPredictions.fighter2.name}
                  </Text>
                </View>

                {/* Single split bar */}
                <View style={styles.splitBar}>
                  {predictionStats.winnerPredictions.fighter1.percentage > 0 && (
                    <View
                      style={[
                        styles.splitBarLeft,
                        {
                          width: predictionStats.winnerPredictions.fighter2.percentage === 0 ? '100%' : `${predictionStats.winnerPredictions.fighter1.percentage}%`,
                          backgroundColor: '#83B4F3'
                        }
                      ]}
                    >
                      <Text style={styles.splitBarPercentage}>
                        {predictionStats.winnerPredictions.fighter2.percentage === 0 ? '100' : predictionStats.winnerPredictions.fighter1.percentage}%
                      </Text>
                    </View>
                  )}
                  {predictionStats.winnerPredictions.fighter2.percentage > 0 && (
                    <View
                      style={[
                        styles.splitBarRight,
                        {
                          width: predictionStats.winnerPredictions.fighter1.percentage === 0 ? '100%' : `${predictionStats.winnerPredictions.fighter2.percentage}%`,
                          backgroundColor: '#FF6B35'
                        }
                      ]}
                    >
                      <Text style={styles.splitBarPercentage}>
                        {predictionStats.winnerPredictions.fighter1.percentage === 0 ? '100' : predictionStats.winnerPredictions.fighter2.percentage}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Per-Fighter Predictions Row */}
              <View style={styles.predictionTextRow}>
                {/* Fighter 1 Prediction (Left) */}
                {(() => {
                  const fighter1Method = (() => {
                    const methodEntries = Object.entries(predictionStats.fighter1MethodPredictions) as [string, number][];
                    const mostPopular = methodEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max, ['DECISION', 0] as [string, number]);
                    return {
                      count: mostPopular[1],
                      label: {
                        'DECISION': 'Decision',
                        'KO_TKO': 'KO/TKO',
                        'SUBMISSION': 'Submission',
                      }[mostPopular[0]] || mostPopular[0],
                    };
                  })();
                  const fighter1Round = (() => {
                    const roundEntries = Object.entries(predictionStats.fighter1RoundPredictions)
                      .map(([round, count]) => [parseInt(round), count] as [number, number])
                      .filter(([_, count]) => count > 0);
                    if (roundEntries.length === 0) return null;
                    const mostPopular = roundEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max, [1, 0] as [number, number]);
                    return { round: mostPopular[0] };
                  })();

                  return fighter1Method.count > 0 && fighter1Round ? (
                    <Text style={[styles.predictionTextLeft, { color: '#83B4F3' }]}>
                      by {fighter1Method.label} in Round {fighter1Round.round}
                    </Text>
                  ) : null;
                })()}

                {/* Fighter 2 Prediction (Right) */}
                {(() => {
                  const fighter2Method = (() => {
                    const methodEntries = Object.entries(predictionStats.fighter2MethodPredictions) as [string, number][];
                    const mostPopular = methodEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max, ['DECISION', 0] as [string, number]);
                    return {
                      count: mostPopular[1],
                      label: {
                        'DECISION': 'Decision',
                        'KO_TKO': 'KO/TKO',
                        'SUBMISSION': 'Submission',
                      }[mostPopular[0]] || mostPopular[0],
                    };
                  })();
                  const fighter2Round = (() => {
                    const roundEntries = Object.entries(predictionStats.fighter2RoundPredictions)
                      .map(([round, count]) => [parseInt(round), count] as [number, number])
                      .filter(([_, count]) => count > 0);
                    if (roundEntries.length === 0) return null;
                    const mostPopular = roundEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max, [1, 0] as [number, number]);
                    return { round: mostPopular[0] };
                  })();

                  return fighter2Method.count > 0 && fighter2Round ? (
                    <Text style={[styles.predictionTextRight, { color: '#FF6B35' }]}>
                      {fighter2Method.label} in Round {fighter2Round.round}
                    </Text>
                  ) : null;
                })()}
              </View>

              <Text style={[styles.predictionSubtext, { color: colors.textSecondary }]}>
                {predictionStats.totalPredictions} {predictionStats.totalPredictions === 1 ? 'prediction' : 'predictions'}
              </Text>
            </View>
          </View>
        )}

        {/* Tags */}
        {fight.topTags && fight.topTags.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Popular Tags</Text>
            <View style={styles.tagsContainer}>
              {fight.topTags.slice(0, 10).map((tagData: any, index: number) => (
                <View
                  key={index}
                  style={[styles.tag, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={[styles.tagText, { color: colors.text }]}>{tagData.tag.name}</Text>
                  <Text style={[styles.tagCount, { color: colors.textSecondary }]}>
                    {tagData.count}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Reviews */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Reviews</Text>

          {/* User's review first (if exists) */}
          {fight.userReview && (
            <View
              style={[styles.reviewCard, styles.myReviewCard, { backgroundColor: colors.background, borderColor: '#83B4F3' }]}
            >
              <View style={styles.reviewContainer}>
                {/* Left side: Upvote button (interactive) */}
                <TouchableOpacity
                  style={styles.upvoteButton}
                  onPress={() => upvoteMutation.mutate({ reviewId: fight.userReview.id })}
                  disabled={upvoteMutation.isPending}
                >
                  <FontAwesome
                    name={fight.userReview.userHasUpvoted ? "thumbs-up" : "thumbs-o-up"}
                    size={18}
                    color={fight.userReview.userHasUpvoted ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.upvoteButtonText,
                      { color: fight.userReview.userHasUpvoted ? colors.primary : colors.textSecondary }
                    ]}
                  >
                    {fight.userReview.upvotes || 0}
                  </Text>
                </TouchableOpacity>

                {/* Right side: Review content */}
                <View style={styles.reviewContentContainer}>
                  <View style={styles.reviewHeader}>
                    <Text style={[styles.reviewAuthor, { color: colors.text }]}>
                      My Review
                    </Text>
                    <View style={styles.reviewRating}>
                      <FontAwesome name="star" size={14} color="#F5C518" />
                      <Text style={[styles.reviewRatingText, { color: colors.text }]}>
                        {fight.userReview.rating}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.reviewContent, { color: colors.textSecondary }]}>
                    {fight.userReview.content}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Other reviews with infinite scroll */}
          {reviewsData?.pages[0]?.reviews && reviewsData.pages[0].reviews.length > 0 ? (
            <>
              {reviewsData.pages.flatMap(page =>
                page.reviews.filter((review: any) => review.userId !== user?.id)
              ).map((review: any) => (
                <View
                  key={review.id}
                  style={[styles.reviewCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <View style={styles.reviewContainer}>
                    {/* Left side: Upvote button */}
                    <TouchableOpacity
                      style={styles.upvoteButton}
                      onPress={() => upvoteMutation.mutate({ reviewId: review.id })}
                      disabled={!isAuthenticated || upvoteMutation.isPending}
                    >
                      <FontAwesome
                        name={review.userHasUpvoted ? "thumbs-up" : "thumbs-o-up"}
                        size={18}
                        color={review.userHasUpvoted ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.upvoteButtonText,
                          { color: review.userHasUpvoted ? colors.primary : colors.textSecondary }
                        ]}
                      >
                        {review.upvotes || 0}
                      </Text>
                    </TouchableOpacity>

                    {/* Right side: Review content */}
                    <View style={styles.reviewContentContainer}>
                      <View style={styles.reviewHeader}>
                        <Text style={[styles.reviewAuthor, { color: colors.text }]}>
                          {review.user.displayName || `${review.user.firstName} ${review.user.lastName}`}
                        </Text>
                        <View style={styles.reviewHeaderRight}>
                          <View style={styles.reviewRating}>
                            <FontAwesome name="star" size={14} color="#F5C518" />
                            <Text style={[styles.reviewRatingText, { color: colors.text }]}>
                              {review.rating}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleFlagReview(review.id)}
                            disabled={!isAuthenticated || flagReviewMutation.isPending}
                            style={styles.flagButton}
                          >
                            <FontAwesome
                              name="flag"
                              size={14}
                              color={review.userHasFlagged ? '#ef4444' : colors.textSecondary}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Text style={[styles.reviewContent, { color: colors.textSecondary }]}>
                        {review.content}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}

              {/* Load more button */}
              {hasNextPage && (
                <TouchableOpacity
                  style={[styles.loadMoreButton, { backgroundColor: colors.primary }]}
                  onPress={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.loadMoreButtonText}>Load More</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : !fight.userReview && (
            <Text style={[styles.noReviewsText, { color: colors.textSecondary }]}>
              No reviews yet. Be the first to review this fight!
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      <FlagReviewModal
        visible={flagModalVisible}
        onClose={() => setFlagModalVisible(false)}
        onSubmit={submitFlagReview}
        isLoading={flagReviewMutation.isPending}
        colorScheme={colorScheme}
      />

      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  matchupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  fighterContainer: {
    flex: 1,
    alignItems: 'center',
  },
  fighterName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  fighterNickname: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  fighterRecord: {
    fontSize: 14,
    marginTop: 4,
  },
  vsContainer: {
    paddingHorizontal: 8,
  },
  vsText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  section: {
    marginHorizontal: 4,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  outcomeContainer: {
    gap: 8,
  },
  spoilerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  revealButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  revealButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  winnerText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  splitScoreRow: {
    flexDirection: 'row',
    marginHorizontal: 4,
    marginBottom: 16,
    gap: 12,
  },
  halfScoreContainer: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  halfScoreValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  halfScoreLabel: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  halfScoreSubLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  myRatingContent: {
    alignItems: 'center',
    gap: 8,
  },
  sparkle: {
    position: 'absolute',
    zIndex: 10,
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
  distributionContainer: {
    gap: 8,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  distributionScore: {
    fontSize: 14,
    fontWeight: '600',
    width: 20,
  },
  distributionBarContainer: {
    flex: 1,
    height: 24,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  distributionBar: {
    height: '100%',
    borderRadius: 4,
  },
  distributionCount: {
    fontSize: 12,
    width: 70,
    textAlign: 'right',
  },
  myPredictionText: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  noPredictionText: {
    fontSize: 15,
    fontStyle: 'italic',
  },
  predictionSubSection: {
    marginBottom: 8,
  },
  splitBarContainer: {
    gap: 8,
    marginBottom: 8,
  },
  fighterNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  fighterNameLeft: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
  },
  fighterNameRight: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  splitBar: {
    flexDirection: 'row',
    height: 32,
    borderRadius: 6,
    overflow: 'hidden',
  },
  splitBarLeft: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitBarRight: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitBarPercentage: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
  },
  predictionSubtext: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  predictionTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: -6,
    paddingHorizontal: 4,
  },
  predictionTextLeft: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'left',
    flex: 1,
  },
  predictionTextRight: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  tagText: {
    fontSize: 14,
  },
  tagCount: {
    fontSize: 12,
  },
  reviewCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  reviewContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  reviewContentContainer: {
    flex: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewAuthor: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flagButton: {
    padding: 4,
  },
  reviewRatingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  myReviewCard: {
    borderWidth: 2,
  },
  noReviewsText: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  loadMoreButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  loadMoreButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  upvoteButton: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 50,
  },
  upvoteButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inlineStarContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    gap: 2,
  },
  inlineStarButton: {
    padding: 2,
  },
  inlineTagsSection: {
    marginBottom: 16,
  },
  inlineTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'flex-start',
  },
  inlineTagButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  inlineTagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  inlineCommentSection: {
    marginBottom: 12,
  },
  inlineCommentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  savingText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  displayStarContainer: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: -24,
  },
  animatedStarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 4,
  },
  wheelContainer: {
    position: 'absolute',
    top: 20,
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
    textAlignVertical: 'center',
    lineHeight: 120,
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    minWidth: 120,
  },
  fadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
});
