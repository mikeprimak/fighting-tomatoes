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
  Platform,
  Keyboard,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQueryClient, useQuery, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { FontAwesome, FontAwesome6, Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { getHypeHeatmapColor, getFlameColor } from '../utils/heatmap';
import { FlagReviewModal, CommentCard, RatingDistributionChart } from '.';
import { useAuth } from '../store/AuthContext';
import { usePredictionAnimation } from '../store/PredictionAnimationContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from './CustomAlert';
import PredictionBarChart from './PredictionBarChart';
import FightDetailsSection from './FightDetailsSection';
import { useFightStats } from '../hooks/useFightStats';
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
  renderMenuButton?: () => React.ReactNode;
  detailsMenuVisible?: boolean;
  setDetailsMenuVisible?: (visible: boolean) => void;
}

// Normalize method from database format to prediction format
const normalizeMethod = (method: string | null | undefined): string | null => {
  if (!method) return null;

  const upperMethod = method.toUpperCase();

  // Check for KO/TKO variations
  if (upperMethod.includes('KO') || upperMethod.includes('TKO')) {
    return 'KO_TKO';
  }

  // Check for Submission variations
  if (upperMethod.includes('SUBMISSION')) {
    return 'SUBMISSION';
  }

  // Check for Decision variations
  if (upperMethod.includes('DECISION')) {
    return 'DECISION';
  }

  return null;
};

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

// Function to get available tags based on rating and community data
const getAvailableTagsForRating = (
  rating: number,
  selectedTags: string[],
  communityTags: Array<{ name: string; count: number }> = []
): Array<{ id: string; name: string; count: number }> => {
  // Determine eligible tags based on rating tier
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

  const MAX_TAGS = 14;

  // Helper function to normalize tag names for matching
  const normalizeTagName = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

  // 1. Always include user's selected tags (with their community counts if available)
  const selectedTagObjects = ALL_FIGHT_TAGS.filter(tag => selectedTags.includes(tag.id)).map(tag => {
    const communityTag = communityTags.find(ct =>
      normalizeTagName(ct.name) === tag.id ||
      normalizeTagName(ct.name) === normalizeTagName(tag.name)
    );
    return {
      id: tag.id,
      name: tag.name,
      count: communityTag?.count || 0
    };
  });

  // 2. Get top 14 community tags that match rating tier
  const eligibleTagIds = new Set(eligibleTags.map(t => t.id));
  const topCommunityTags = communityTags
    .map(ct => {
      const tag = ALL_FIGHT_TAGS.find(t =>
        normalizeTagName(ct.name) === t.id ||
        normalizeTagName(ct.name) === normalizeTagName(t.name)
      );
      return tag ? { id: tag.id, name: tag.name, count: ct.count } : null;
    })
    .filter((tag): tag is { id: string; name: string; count: number } =>
      tag !== null &&
      eligibleTagIds.has(tag.id) &&
      !selectedTags.includes(tag.id)
    )
    .slice(0, 14);

  // 3. Fill remaining slots with random rating-appropriate tags
  const usedTagIds = new Set([
    ...selectedTagObjects.map(t => t.id),
    ...topCommunityTags.map(t => t.id)
  ]);

  const remainingEligibleTags = eligibleTags
    .filter(tag => !usedTagIds.has(tag.id))
    .map(tag => ({ id: tag.id, name: tag.name, count: 0 }));

  const totalSoFar = selectedTagObjects.length + topCommunityTags.length;
  const remainingSlots = Math.max(0, MAX_TAGS - totalSoFar);

  let randomTags: Array<{ id: string; name: string; count: number }> = [];
  if (remainingSlots > 0 && remainingEligibleTags.length > 0) {
    const shuffled = shuffleArray(remainingEligibleTags);
    randomTags = shuffled.slice(0, remainingSlots);
  }

  // Combine: selected tags + top community tags + random filler tags
  const allTags = [...selectedTagObjects, ...topCommunityTags, ...randomTags];
  return allTags.slice(0, MAX_TAGS);
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

export default function CompletedFightDetailScreen({
  fight,
  onRatingSuccess,
  renderMenuButton,
  detailsMenuVisible: externalDetailsMenuVisible,
  setDetailsMenuVisible: externalSetDetailsMenuVisible
}: CompletedFightDetailScreenProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, refreshUserData } = useAuth();
  const { setPendingRatingAnimation } = usePredictionAnimation();
  const { alertState, showSuccess, showError, showConfirm, hideAlert } = useCustomAlert();

  const [animateMyRating, setAnimateMyRating] = useState(false);
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [reviewToFlag, setReviewToFlag] = useState<string | null>(null);

  // Use external state if provided, otherwise use internal state
  const [internalDetailsMenuVisible, setInternalDetailsMenuVisible] = useState(false);
  const detailsMenuVisible = externalDetailsMenuVisible !== undefined ? externalDetailsMenuVisible : internalDetailsMenuVisible;
  const setDetailsMenuVisible = externalSetDetailsMenuVisible || setInternalDetailsMenuVisible;

  const [predictionTab, setPredictionTab] = useState<'mine' | 'community'>('mine');
  const [commentsTab, setCommentsTab] = useState<'postfight' | 'prefight'>('postfight');
  const [hasLocallyRevealed, setHasLocallyRevealed] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [isEditingComment, setIsEditingComment] = useState(false);

  // Inline rating state - Initialize once with existing data, then manage locally
  const [rating, setRating] = useState(() => {
    if (fight.userReview) return fight.userReview.rating || 0;
    if (fight.userRating) return typeof fight.userRating === 'number' ? fight.userRating : (fight.userRating.rating || 0);
    return 0;
  });
  const [comment, setComment] = useState(() => fight.userReview?.content || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const userTags = fight.userTags || [];
    if (userTags.length === 0) return [];
    return userTags.map((userTag: any) => {
      const tagName = typeof userTag === 'string' ? userTag.toLowerCase() : (userTag.tag?.name || userTag.name || '').toLowerCase();
      const frontendTag = ALL_FIGHT_TAGS.find(tag => tag.name.toLowerCase() === tagName || tag.id.toLowerCase() === tagName);
      return frontendTag?.id;
    }).filter(Boolean) as string[];
  });
  const [tagRandomSeed, setTagRandomSeed] = useState(Math.floor(Math.random() * 1000));

  // Animation values for wheel animation (large star display) - Initialize based on existing rating
  const wheelAnimation = useRef(new Animated.Value(
    fight.userRating ? (10 - fight.userRating) * 52 : 520
  )).current;
  const starColorAnimation = useRef(new Animated.Value(fight.userRating ? 1 : 0)).current;

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

  // Animation for tags fade
  const tagsOpacity = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<View>(null);

  // Keyboard height state for dynamic padding
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // State for displayed tags (delayed update for smooth animation)
  const [displayedTags, setDisplayedTags] = useState<Array<{ id: string; name: string; count: number }>>([]);

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

  const fetchedPredictionStats = fightStatsData?.predictionStats;
  const aggregateStats = fightStatsData?.aggregateStats;

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
  const predictionStats = testPredictionStats;

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

  // Fetch pre-fight comments
  const { data: preFightCommentsData } = useQuery({
    queryKey: ['preFightComments', fight.id],
    queryFn: () => apiService.getFightPreFightComments(fight.id),
    enabled: !!fight.id,
    staleTime: 60 * 1000,
  });

  // Calculate available tags based on current rating and community data
  const availableTags = React.useMemo(() => {
    const communityTags = aggregateStats?.topTags || [];
    return getAvailableTagsForRating(rating, selectedTags, communityTags);
  }, [rating, selectedTags, tagRandomSeed, aggregateStats?.topTags]);

  // Initialize displayed tags on first render
  useEffect(() => {
    if (displayedTags.length === 0) {
      setDisplayedTags(availableTags);
    }
  }, []);

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

  // Animate tags when they change (fade out → update → fade in)
  useEffect(() => {
    // Only animate if tags actually changed
    if (displayedTags.length > 0 && JSON.stringify(displayedTags) !== JSON.stringify(availableTags)) {
      // Fade out
      Animated.timing(tagsOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        // Update tags while invisible
        setDisplayedTags(availableTags);
        // Fade in with new tags
        Animated.timing(tagsOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [rating, tagRandomSeed]);

  // Mutation for auto-saving rating/review/tags
  const updateUserDataMutation = useMutation({
    mutationFn: async (data: { rating: number | null; review: string | null; tags: string[]; }) => {
      return await apiService.updateFightUserData(fight.id, data);
    },
    onSuccess: () => {
      // Mark this fight as needing animation
      setPendingRatingAnimation(fight.id);

      // Only invalidate queries - no state updates that cause re-renders
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightTags', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightReviews', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightStats', fight.id] }); // This fetches both prediction and aggregate stats
      queryClient.invalidateQueries({ queryKey: ['eventFights', fight.event.id] });
      queryClient.invalidateQueries({ queryKey: ['topRecentFights'] });
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
      // Also invalidate the top comments cache
      queryClient.invalidateQueries({ queryKey: ['topComments'] });
    },
  });

  // Manual save handler for comment
  const handleSaveComment = async () => {
    // Check if user is trying to delete an existing comment
    const isDeletingComment = fight.userReview && !comment.trim();

    // Confirm deletion if user is removing their existing comment
    if (isDeletingComment) {
      showConfirm(
        'Are you sure you want to delete your comment?',
        async () => {
          // User confirmed deletion
          const submissionData = {
            rating: rating > 0 ? rating : null,
            review: null,
            tags: selectedTags
          };

          try {
            await updateUserDataMutation.mutateAsync(submissionData);
            setIsEditingComment(false);
            setShowCommentForm(false);
          } catch (error) {
            console.error('Failed to delete comment:', error);
          }
        },
        'Delete Comment',
        'Delete',
        'Cancel',
        true // destructive style
      );
      return;
    }

    const submissionData = {
      rating: rating > 0 ? rating : null,
      review: comment.trim() || null,
      tags: selectedTags
    };

    // Check if this is a new review (not editing existing)
    const isNewReview = !fight.userReview && comment.trim();

    try {
      // Save the comment - this returns the created/updated review
      const response = await updateUserDataMutation.mutateAsync(submissionData);

      // If it's a new review with content, auto-upvote it
      if (isNewReview && response?.data?.review?.id) {
        const reviewId = response.data.review.id;
        // Auto-upvote the newly created review
        await upvoteMutation.mutateAsync({ reviewId });
      }

      // Exit edit mode and hide form after successful save
      setIsEditingComment(false);
      setShowCommentForm(false);
    } catch (error) {
      // Error handling is already done in the mutation's onError
      console.error('Failed to save comment:', error);
    }
  };

  // Handle comment input focus - let native behavior handle scroll
  const handleCommentFocus = () => {
    // Native keyboard behavior will handle scrolling
  };

  // Handle showing comment form - let native behavior handle scroll
  const handleToggleCommentForm = () => {
    setShowCommentForm(!showCommentForm);
    // Native keyboard behavior will handle scrolling when input is focused
  };

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

  const revealOutcomeMutation = useMutation({
    mutationFn: () => apiService.revealFightOutcome(fight.id),
    onSuccess: () => {
      // Invalidate fight query to refetch with updated hasRevealedOutcome
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
    },
    onError: (error: any) => {
      showError(error?.error || 'Failed to reveal outcome');
    },
  });

  const handleRevealOutcome = () => {
    setHasLocallyRevealed(true);
    revealOutcomeMutation.mutate();
  };

  // Computed value: outcome is revealed if user rated OR tapped reveal OR backend says it's revealed
  const isOutcomeRevealed = rating > 0 || hasLocallyRevealed || fight.hasRevealedOutcome;

  const handleFlagReview = (reviewId: string) => {
    setReviewToFlag(reviewId);
    setFlagModalVisible(true);
  };

  const submitFlagReview = (reason: string) => {
    if (reviewToFlag) {
      flagReviewMutation.mutate({ reviewId: reviewToFlag, reason });
    }
  };

  // Auto-save handler - only auto-saves rating and tags, NOT comment
  const handleAutoSave = React.useCallback(() => {
    const submissionData = {
      rating: rating > 0 ? rating : null,
      review: null, // Don't auto-save comment
      tags: selectedTags
    };

    updateUserDataMutation.mutate(submissionData);
  }, [rating, selectedTags]);

  // Simple animation function (like UpcomingFightDetailScreen)
  const animateToNumber = (targetNumber: number) => {
    wheelAnimation.stopAnimation();

    const targetPosition = targetNumber === 0 ? 520 : (10 - targetNumber) * 52;

    Animated.timing(wheelAnimation, {
      toValue: targetPosition,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  // Handlers for rating and tags (immediate save) - Simplified like UpcomingFightDetailScreen
  const handleSetRating = (newRating: number) => {
    const finalRating = rating === newRating ? 0 : newRating;

    setRating(finalRating);
    setTagRandomSeed(prev => prev + 1);

    // If rating > 0, reveal the outcome immediately
    if (finalRating > 0) {
      setHasLocallyRevealed(true);
    }

    // Animate wheel
    animateToNumber(finalRating);

    // Animate star color
    Animated.timing(starColorAnimation, {
      toValue: finalRating > 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();

    // Save immediately
    const submissionData = {
      rating: finalRating > 0 ? finalRating : null,
      review: comment.trim() || null,
      tags: selectedTags
    };
    updateUserDataMutation.mutate(submissionData);
  };

  const handleToggleTag = (tagId: string) => {
    const isSelecting = !selectedTags.includes(tagId);
    const newTags = isSelecting
      ? [...selectedTags, tagId]
      : selectedTags.filter(id => id !== tagId);

    setSelectedTags(newTags);

    // Optimistically update the displayed tag counts
    setDisplayedTags(prevTags =>
      prevTags.map(tag =>
        tag.id === tagId
          ? { ...tag, count: Math.max(0, tag.count + (isSelecting ? 1 : -1)) }
          : tag
      )
    );

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

    // Green ring - actual winner (always show)
    if (fight.winner === fighterId) {
      rings.push('winner');
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
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: keyboardHeight > 0 ? keyboardHeight + 20 : 80
        }}
      >

        {/* My Rating Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: 15 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0 }}>
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              My Rating
            </Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Inline Rating Section */}
        <View style={[styles.section, { backgroundColor: 'transparent', borderWidth: 0, marginTop: 20 }]}>
          <View style={styles.userInputTitleRow}>
            <View style={styles.yellowSideLine} />
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 14, marginBottom: 0 }]}>Rate This Fight</Text>
          </View>

          {/* User's rating selection row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: -10 }}>
            {/* User icon and rating box */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginLeft: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                <FontAwesome name="user" size={20} color={colors.textSecondary} />
              </View>
              <View style={[styles.displayFlameContainer, { marginTop: 10 }]}>
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
                        const ratingColor = getHypeHeatmapColor(number);
                        const flameColor = getFlameColor(ratingColor, colors.background);

                        return (
                          <View key={number} style={styles.wheelBoxContainer}>
                            <View style={[
                              styles.wheelBox,
                              { backgroundColor: ratingColor }
                            ]}>
                              <FontAwesome
                                name="star"
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

            {/* Row of selectable stars (1-10) */}
            <View style={[styles.flameContainer, { flex: 1, gap: 0, marginLeft: -12, marginTop: -5 }]}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
                const isSelected = level <= rating;
                const starColor = isSelected ? getHypeHeatmapColor(level) : '#808080';

                return (
                  <TouchableOpacity
                    key={level}
                    onPress={() => handleSetRating(level)}
                    style={styles.flameButton}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <View style={{ width: 26, alignItems: 'center' }}>
                      <FontAwesome
                        name={isSelected ? "star" : "star-o"}
                        size={26}
                        color={starColor}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Community Rating Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: -34 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0 }}>
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              Community Rating
            </Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Community Rating Data */}
        <View style={[styles.sectionNoBorder, { marginTop: 26 }]}>
          {/* Community Rating Layout: Horizontal */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 0 }}>
            {/* Community Rating Box */}
            {(() => {
              const ratingColor = fight.averageRating > 0
                ? getHypeHeatmapColor(Math.round(fight.averageRating))
                : colors.border;

              // Mix 70% heatmap color with 30% background color for star icon
              const getStarColor = (ratingColor: string, bgColor: string): string => {
                // Parse rating color (RGB or hex)
                const ratingRgbaMatch = ratingColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                const ratingHexMatch = ratingColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);

                let ratingR = 0, ratingG = 0, ratingB = 0;
                if (ratingRgbaMatch) {
                  ratingR = parseInt(ratingRgbaMatch[1]);
                  ratingG = parseInt(ratingRgbaMatch[2]);
                  ratingB = parseInt(ratingRgbaMatch[3]);
                } else if (ratingHexMatch) {
                  ratingR = parseInt(ratingHexMatch[1], 16);
                  ratingG = parseInt(ratingHexMatch[2], 16);
                  ratingB = parseInt(ratingHexMatch[3], 16);
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

                // Mix 70% rating + 30% background
                const mixedR = Math.round(ratingR * 0.7 + bgR * 0.3);
                const mixedG = Math.round(ratingG * 0.7 + bgG * 0.3);
                const mixedB = Math.round(ratingB * 0.7 + bgB * 0.3);

                return `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
              };

              const starColor = getStarColor(ratingColor, colors.background);

              return (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <FontAwesome name="users" size={19} color={colors.textSecondary} />
                  </View>
                  <View style={{
                    width: 40,
                    height: 40,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 8,
                    backgroundColor: ratingColor,
                  }}>
                    <FontAwesome
                      name="star"
                      size={24}
                      color={starColor}
                      style={{ position: 'absolute' }}
                    />
                    <Text style={{
                      color: '#FFFFFF',
                      fontSize: 14,
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}>
                      {fight.averageRating
                        ? fight.averageRating % 1 === 0
                          ? fight.averageRating.toString()
                          : fight.averageRating.toFixed(1)
                        : '0'}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Rating Distribution Chart */}
            {aggregateStats?.ratingDistribution && (
              <View style={{ marginTop: -6 }}>
                <RatingDistributionChart
                  distribution={aggregateStats.ratingDistribution}
                  totalRatings={totalRatings}
                />
              </View>
            )}
          </View>
        </View>

        {/* Tags Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: -22 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0 }}>
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              TAGS
            </Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Tags Content */}
        <View style={[styles.section, { backgroundColor: 'transparent', borderWidth: 0, marginTop: 20 }]}>
          {displayedTags.length > 0 && (() => {
            const tagsWithVotes = displayedTags.filter(tag => tag.count > 0);
            const tagsWithoutVotes = displayedTags.filter(tag => tag.count === 0);

            return (
              <View style={styles.inlineTagsSection}>
                {/* Tags with votes */}
                {tagsWithVotes.length > 0 && (
                  <View style={styles.inlineTagsContainer}>
                    {tagsWithVotes.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id);
                      return (
                        <Animated.View
                          key={tag.id}
                          style={{ opacity: isSelected ? 1 : tagsOpacity }}
                        >
                          <TouchableOpacity
                            onPress={() => handleToggleTag(tag.id)}
                            style={[
                              styles.inlineTagButton,
                              {
                                backgroundColor: isSelected ? colors.primary : colors.background,
                                borderColor: colors.border,
                              }
                            ]}
                          >
                            <Text style={[
                              styles.inlineTagText,
                              {
                                color: isSelected ? colors.textOnAccent : colors.text
                              }
                            ]}>
                              {tag.name} ({tag.count})
                            </Text>
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })}
                  </View>
                )}

                {/* Separator with "Other Choices" label */}
                {tagsWithVotes.length > 0 && tagsWithoutVotes.length > 0 && (
                  <View style={{ marginTop: 16, marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase' }}>
                      Other Choices
                    </Text>
                  </View>
                )}

                {/* Tags without votes */}
                {tagsWithoutVotes.length > 0 && (
                  <View style={styles.inlineTagsContainer}>
                    {tagsWithoutVotes.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id);
                      return (
                        <Animated.View
                          key={tag.id}
                          style={{ opacity: isSelected ? 1 : tagsOpacity }}
                        >
                          <TouchableOpacity
                            onPress={() => handleToggleTag(tag.id)}
                            style={[
                              styles.inlineTagButton,
                              {
                                backgroundColor: isSelected ? colors.primary : colors.background,
                                borderColor: colors.border,
                              }
                            ]}
                          >
                            <Text style={[
                              styles.inlineTagText,
                              {
                                color: isSelected ? colors.textOnAccent : colors.text
                              }
                            ]}>
                              {tag.name}
                            </Text>
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })()}
        </View>

        {/* Outcome Section Divider */}
        <View style={[styles.sectionDivider, { marginTop: -22 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={{ flexShrink: 0 }}>
            <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
              OUTCOME
            </Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Outcome Content */}
        <View style={styles.sectionNoBorder}>
          {/* Outcome Text with Label */}
          {!fight.winner ? (
            <Text style={[styles.whatHappenedPromptText, { color: colors.textSecondary, marginTop: 20, textAlign: 'center' }]}>
              Outcome data not yet available.
            </Text>
          ) : !isOutcomeRevealed ? (
            <TouchableOpacity onPress={handleRevealOutcome} style={{ marginTop: 20 }}>
              <Text style={[styles.whatHappenedPromptText, { color: colors.textSecondary, textAlign: 'center' }]}>
                Rate fight or <Text style={{ color: '#F5C518' }}>tap here</Text> to show outcome.
              </Text>
            </TouchableOpacity>
          ) : null}

          <View style={[styles.whatHappenedContainer, { marginTop: 16, alignItems: 'flex-start' }]}>
            {/* Fighter 1 */}
            <View style={styles.whatHappenedFighter}>
              <View style={[
                styles.whatHappenedImageContainer,
                isOutcomeRevealed && fight.winner === fight.fighter1.id && { borderColor: '#22c55e', borderWidth: 3 }
              ]}>
                <Image
                  source={
                    fight.fighter1.profileImage
                      ? { uri: fight.fighter1.profileImage }
                      : getFighterPlaceholderImage(fight.fighter1.id)
                  }
                  style={styles.whatHappenedImage}
                />
              </View>
              <Text style={[styles.whatHappenedName, { color: colors.text }]}>
                {fight.fighter1.firstName} {fight.fighter1.lastName}
              </Text>
              {isOutcomeRevealed && fight.winner === fight.fighter1.id ? (
                <Text style={{ color: '#22c55e', fontSize: 13, marginTop: 4, textAlign: 'center', fontWeight: '600' }}>
                  by {fight.method?.includes('Decision') ? 'Decision' : (fight.method || 'Unknown')}
                  {fight.round && !fight.method?.includes('Decision') && ` R${fight.round}`}
                  {fight.time && ` ${fight.time}`}
                </Text>
              ) : isOutcomeRevealed ? (
                <View style={{ height: 20 }} />
              ) : null}
            </View>

            {/* Fighter 2 */}
            <View style={styles.whatHappenedFighter}>
              <View style={[
                styles.whatHappenedImageContainer,
                isOutcomeRevealed && fight.winner === fight.fighter2.id && { borderColor: '#22c55e', borderWidth: 3 }
              ]}>
                <Image
                  source={
                    fight.fighter2.profileImage
                      ? { uri: fight.fighter2.profileImage }
                      : getFighterPlaceholderImage(fight.fighter2.id)
                  }
                  style={styles.whatHappenedImage}
                />
              </View>
              <Text style={[styles.whatHappenedName, { color: colors.text }]}>
                {fight.fighter2.firstName} {fight.fighter2.lastName}
              </Text>
              {isOutcomeRevealed && fight.winner === fight.fighter2.id ? (
                <Text style={{ color: '#22c55e', fontSize: 13, marginTop: 4, textAlign: 'center', fontWeight: '600' }}>
                  by {fight.method?.includes('Decision') ? 'Decision' : (fight.method || 'Unknown')}
                  {fight.round && !fight.method?.includes('Decision') && ` R${fight.round}`}
                  {fight.time && ` ${fight.time}`}
                </Text>
              ) : isOutcomeRevealed ? (
                <View style={{ height: 20 }} />
              ) : null}
            </View>
          </View>

          {/* Predictions Section Divider */}
          <View style={[styles.sectionDivider, { marginTop: 20 }]}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <View style={{ flexShrink: 0 }}>
              <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
                Predictions
              </Text>
            </View>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Community Predictions Bar Chart */}
          {predictionStats && predictionStats.fighter1MethodPredictions && predictionStats.fighter2MethodPredictions && predictionStats.winnerPredictions && (() => {
            const normalized = normalizeMethod(fight.method);
            console.log('[CompletedFight] Passing to chart:', {
              winner: fight.winner,
              method: fight.method,
              normalized,
              fighter1Id: fight.fighter1.id,
              fighter2Id: fight.fighter2.id,
            });
            return (
              <View style={{ marginTop: 40 }}>
                <PredictionBarChart
                  fighter1Name={fight.fighter1.lastName}
                  fighter2Name={fight.fighter2.lastName}
                  fighter1Id={fight.fighter1.id}
                  fighter2Id={fight.fighter2.id}
                  selectedWinner={fight.userPredictedWinner || null}
                  selectedMethod={fight.userPredictedMethod || null}
                  fighter1Predictions={predictionStats.fighter1MethodPredictions}
                  fighter2Predictions={predictionStats.fighter2MethodPredictions}
                  totalPredictions={predictionStats.totalPredictions}
                  winnerPredictions={predictionStats.winnerPredictions}
                  showColors={true}
                  showLabels={true}
                  actualWinner={fight.winner}
                  actualMethod={normalized}
                />
              </View>
            );
          })()}
        </View>

        {/* Split Score Row - HIDDEN */}
        {false && <View style={styles.splitScoreRow}>
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
        </View>}

        {/* Fight Details - HIDDEN */}
        {false &&
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
        </View>}

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

        {/* Comments */}
        <View style={styles.sectionNoBorder}>
          {/* Title row with Add Comment / Cancel button */}
          <View style={styles.commentHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Comments</Text>
            {!fight.userReview && !isEditingComment && (
              <TouchableOpacity
                onPress={handleToggleCommentForm}
                style={styles.addCommentButton}
              >
                <Text style={[styles.addCommentButtonText, { color: colors.tint }]}>
                  {showCommentForm ? 'Cancel' : 'Add Comment'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tab Buttons */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                { borderColor: colors.border },
                commentsTab === 'postfight' && { backgroundColor: colors.primary }
              ]}
              onPress={() => setCommentsTab('postfight')}
            >
              <Text style={[
                styles.tabButtonText,
                { color: commentsTab === 'postfight' ? colors.textOnAccent : colors.text }
              ]}>
                Post-Fight Reviews
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                { borderColor: colors.border },
                commentsTab === 'prefight' && { backgroundColor: colors.primary }
              ]}
              onPress={() => setCommentsTab('prefight')}
            >
              <Text style={[
                styles.tabButtonText,
                { color: commentsTab === 'prefight' ? colors.textOnAccent : colors.text }
              ]}>
                Pre-Fight Hype
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          {commentsTab === 'postfight' ? (
            <>
              {/* Show comment input when showCommentForm is true (for new comments) OR when editing */}
              {((showCommentForm && !fight.userReview) || isEditingComment) && (
                <View ref={commentInputRef} collapsable={false} style={{ marginTop: 16 }}>
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
                      placeholder="Write a review... (optional)"
                      placeholderTextColor={colors.textSecondary}
                      multiline
                      numberOfLines={4}
                      maxLength={500}
                      value={comment}
                      onChangeText={setComment}
                      onFocus={handleCommentFocus}
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.saveCommentButton,
                      {
                        backgroundColor: (fight.userReview || comment.trim().length > 0) ? colors.tint : colors.card,
                      }
                    ]}
                    disabled={updateUserDataMutation.isPending}
                    onPress={handleSaveComment}
                  >
                    <Text style={[
                      styles.saveCommentButtonText,
                      { color: (fight.userReview || comment.trim().length > 0) ? '#000' : colors.text }
                    ]}>
                      {updateUserDataMutation.isPending ? 'Saving...' : 'Save Comment'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

          {/* User's review first (if exists and not editing) */}
          {fight.userReview && !isEditingComment && (
            <View style={{ marginTop: 16 }}>
            <CommentCard
              comment={{
                id: fight.userReview.id,
                content: fight.userReview.content,
                rating: fight.userReview.rating,
                upvotes: fight.userReview.upvotes || 0,
                userHasUpvoted: fight.userReview.userHasUpvoted,
                user: {
                  displayName: user?.displayName || 'You',
                },
              }}
              onEdit={() => setIsEditingComment(true)}
              onUpvote={() => upvoteMutation.mutate({ reviewId: fight.userReview.id })}
              isUpvoting={upvoteMutation.isPending}
              isAuthenticated={isAuthenticated}
              showMyReview={true}
            />
            </View>
          )}

          {/* Other reviews with infinite scroll */}
          {reviewsData?.pages[0]?.reviews && reviewsData.pages[0]?.reviews.length > 0 ? (
            <View style={{ marginTop: 16 }}>
              {reviewsData.pages.flatMap(page =>
                page.reviews.filter((review: any) => review.userId !== user?.id)
              ).map((review: any) => (
                <CommentCard
                  key={review.id}
                  comment={{
                    id: review.id,
                    content: review.content,
                    rating: review.rating,
                    upvotes: review.upvotes || 0,
                    userHasUpvoted: review.userHasUpvoted,
                    user: {
                      displayName: review.user.displayName || `${review.user.firstName} ${review.user.lastName}`,
                    },
                  }}
                  onUpvote={() => upvoteMutation.mutate({ reviewId: review.id })}
                  onFlag={() => handleFlagReview(review.id)}
                  isUpvoting={upvoteMutation.isPending}
                  isFlagging={flagReviewMutation.isPending && reviewToFlag === review.id}
                  isAuthenticated={isAuthenticated}
                />
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
            </View>
          ) : !fight.userReview && (
            <Text style={[styles.noReviewsText, { color: colors.textSecondary }]}>
              No reviews yet. Be the first to review this fight!
            </Text>
          )}
            </>
          ) : (
            <>
              {/* Pre-Fight Comments */}
              {preFightCommentsData && preFightCommentsData.comments && preFightCommentsData.comments.length > 0 ? (
                preFightCommentsData.comments.map((comment: any) => (
                  <View key={comment.id} style={styles.preFightCommentCard}>
                    <View style={styles.preFightCommentHeader}>
                      <Text style={[styles.preFightCommentUser, { color: colors.text }]}>
                        {comment.user.displayName || `${comment.user.firstName} ${comment.user.lastName}`}
                      </Text>
                      <Text style={[styles.preFightCommentDate, { color: colors.textSecondary }]}>
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={[styles.preFightCommentContent, { color: colors.text }]}>
                      {comment.content}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.noReviewsText, { color: colors.textSecondary }]}>
                  No pre-fight comments yet.
                </Text>
              )}
            </>
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

      {/* Fight Details Menu */}
      <FightDetailsMenu
        fight={fight}
        visible={detailsMenuVisible}
        onClose={() => setDetailsMenuVisible(false)}
      />
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  predictionResultText: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  sectionNoBorder: {
    marginHorizontal: 4,
    marginBottom: 16,
    padding: 16,
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
  outcomeContainer: {
    gap: 8,
  },
  spoilerButtonContainer: {
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 16,
  },
  revealButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  revealButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  victoryText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  winnerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  winnerCheckmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 1000,
    elevation: 10, // Android
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodCheckmark: {
    position: 'absolute',
    top: 2,
    right: 2,
    zIndex: 1000,
    elevation: 10, // Android
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockIcon: {
    position: 'absolute',
    bottom: 8,
    right: 11,
    zIndex: 999,
  },
  methodLockIcon: {
    position: 'absolute',
    bottom: 6,
    right: 9,
    zIndex: 999,
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
    marginTop: 10,
    marginBottom: 16,
  },
  inlineTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'flex-start',
  },
  inlineTagButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  inlineTagText: {
    fontSize: 12,
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
  communityRatingsSection: {
    marginHorizontal: 4,
    marginBottom: 16,
    padding: 16,
  },
  communityRatingsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  communityRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  communityRatingLabel: {
    fontSize: 16,
  },
  communityRatingValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  fightOutcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  displayStarContainer: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: -49,
  },
  animatedStarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 4,
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
    textAlignVertical: 'center',
    lineHeight: 120,
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    minWidth: 120,
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
  flameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: -15,
  },
  flameButton: {
    padding: 2,
  },
  fadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  beforeFightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  beforeFightLabel: {
    fontSize: 16,
  },
  beforeFightValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabContent: {
    marginTop: 8,
  },
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  predictionLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  predictionValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  preFightCommentCard: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  preFightCommentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  preFightCommentUser: {
    fontSize: 14,
    fontWeight: '600',
  },
  preFightCommentDate: {
    fontSize: 12,
  },
  preFightCommentContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  whatHappenedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 16,
    marginBottom: 12,
    gap: 16,
  },
  whatHappenedFighter: {
    alignItems: 'center',
    flex: 1,
  },
  whatHappenedImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 8,
  },
  whatHappenedImage: {
    width: '100%',
    height: '100%',
  },
  whatHappenedName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  whatHappenedWinnerText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  whatHappenedPromptText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  commentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  communityRatingHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  communityStatsContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  communityRatingSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  communityStatsValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 8,
  },
  communityStatsLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  communityRatingCount: {
    fontSize: 12,
    marginTop: 4,
  },
  communityTagsSection: {
    width: '100%',
    alignItems: 'center',
  },
  communityTagsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  communityTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  communityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  communityTagText: {
    fontSize: 14,
    fontWeight: '400',
  },
  communityTagCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  hypeBox: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  hypeBoxText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
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
});
