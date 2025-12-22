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
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useQueryClient, useQuery, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { FontAwesome, FontAwesome6, Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { getHypeHeatmapColor, getFlameColor } from '../utils/heatmap';
import { FlagReviewModal, CommentCard, RatingDistributionChart } from '.';
import HypeDistributionChart from './HypeDistributionChart';
import { PreFightCommentCard } from './PreFightCommentCard';
import { useAuth } from '../store/AuthContext';
import { usePredictionAnimation } from '../store/PredictionAnimationContext';
import { useVerification } from '../store/VerificationContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from './CustomAlert';
import PredictionBarChart from './PredictionBarChart';
import Button from './Button';
import FightDetailsSection from './FightDetailsSection';
import { useFightStats } from '../hooks/useFightStats';
import FightDetailsMenu from './FightDetailsMenu';
import SectionContainer from './SectionContainer';

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
  cardType?: string | null;
  orderOnCard?: number | null;
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

  const MAX_TAGS = 10;

  // Helper function to normalize tag names for matching
  const normalizeTagName = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

  // 1. Always include user's selected tags (with their community counts if available)
  const selectedTagObjects = ALL_FIGHT_TAGS.filter(tag => selectedTags.includes(tag.id)).map(tag => {
    const communityTag = communityTags.find(ct =>
      normalizeTagName(ct.name) === tag.id ||
      normalizeTagName(ct.name) === normalizeTagName(tag.name)
    );
    // If selected, ensure count is at least 1 (to account for user's own vote)
    return {
      id: tag.id,
      name: tag.name,
      count: Math.max(1, communityTag?.count || 0)
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
  const { requireVerification } = useVerification();
  const { alertState, showSuccess, showError, showConfirm, hideAlert } = useCustomAlert();

  const [animateMyRating, setAnimateMyRating] = useState(false);
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [reviewToFlag, setReviewToFlag] = useState<string | null>(null);

  // Reply state
  const [replyingToReviewId, setReplyingToReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  // Edit reply state
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyText, setEditReplyText] = useState<string>('');

  // Frozen review order - prevents layout shifts when upvoting
  const [frozenReviewOrder, setFrozenReviewOrder] = useState<string[]>([]);

  // Use external state if provided, otherwise use internal state
  const [internalDetailsMenuVisible, setInternalDetailsMenuVisible] = useState(false);
  const detailsMenuVisible = externalDetailsMenuVisible !== undefined ? externalDetailsMenuVisible : internalDetailsMenuVisible;
  const setDetailsMenuVisible = externalSetDetailsMenuVisible || setInternalDetailsMenuVisible;

  const [predictionTab, setPredictionTab] = useState<'mine' | 'community'>('mine');
  const [commentsTab, setCommentsTab] = useState<'postfight' | 'preflight'>('postfight');
  const [hasLocallyRevealed, setHasLocallyRevealed] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);
  const [commentToFlag, setCommentToFlag] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const INITIAL_REPLIES_SHOWN = 3;

  // Animation for toast notification
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(50)).current;

  // Inline rating state - Initialize once with existing data, then manage locally
  // Handle userRating as number, string, or object with .rating property
  const [rating, setRating] = useState(() => {
    if (fight.userReview?.rating) return Number(fight.userReview.rating) || 0;
    if (fight.userRating != null) {
      if (typeof fight.userRating === 'object') {
        return Number((fight.userRating as any).rating) || 0;
      }
      return Number(fight.userRating) || 0;
    }
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

  // Track if user has made their first rating selection - tags don't refresh on first selection
  const hasSetRatingOnce = useRef(false);

  // Animation values for wheel animation (large star display) - Initialize based on existing rating
  // Using 92px per item for taller rating boxes (48x82)
  // Must match the rating state initialization logic
  const initialRatingForWheel = (() => {
    if (fight.userReview?.rating) return Number(fight.userReview.rating) || 0;
    if (fight.userRating != null) {
      if (typeof fight.userRating === 'object') {
        return Number((fight.userRating as any).rating) || 0;
      }
      return Number(fight.userRating) || 0;
    }
    return 0;
  })();
  const wheelAnimation = useRef(new Animated.Value(
    initialRatingForWheel > 0 ? (10 - initialRatingForWheel) * 115 : 1150
  )).current;
  const starColorAnimation = useRef(new Animated.Value(initialRatingForWheel > 0 ? 1 : 0)).current;

  // Sync rating state when fight data changes (e.g., navigating between fights or data refresh)
  // Use refs to track the fight ID and whether we've synced data for this fight
  const lastFightIdRef = useRef(fight.id);
  const hasSyncedRatingRef = useRef(false);

  useEffect(() => {
    // Calculate the rating from fight data
    // Handle userRating as number, string, or object with .rating property
    let dataRating = 0;
    if (fight.userReview?.rating) {
      dataRating = Number(fight.userReview.rating) || 0;
    } else if (fight.userRating != null) {
      // Could be number, string, or object - handle all cases
      if (typeof fight.userRating === 'object') {
        dataRating = Number((fight.userRating as any).rating) || 0;
      } else {
        dataRating = Number(fight.userRating) || 0;
      }
    }

    // Sync if:
    // 1. We navigated to a different fight, OR
    // 2. We haven't synced yet AND data just arrived (rating was 0 but now has value)
    const isNewFight = lastFightIdRef.current !== fight.id;
    const dataJustArrived = !hasSyncedRatingRef.current && dataRating > 0;

    if (isNewFight) {
      lastFightIdRef.current = fight.id;
      hasSyncedRatingRef.current = false; // Reset for new fight
    }

    if (isNewFight || dataJustArrived) {
      if (dataRating > 0) {
        hasSyncedRatingRef.current = true;
      }
      setRating(dataRating);

      // Also sync the wheel animation and star color animation
      const targetPosition = dataRating > 0 ? (10 - dataRating) * 115 : 1150;
      wheelAnimation.setValue(targetPosition);
      starColorAnimation.setValue(dataRating > 0 ? 1 : 0);
    }
  }, [fight.id, fight.userRating, fight.userReview?.rating]);

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
  const replyInputRef = useRef<View>(null);

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

  const predictionStats = fightStatsData?.predictionStats;
  const aggregateStats = fightStatsData?.aggregateStats;

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

  // Freeze review order on initial load to prevent layout shifts from upvotes
  useEffect(() => {
    if (reviewsData?.pages && frozenReviewOrder.length === 0) {
      const allReviewIds = reviewsData.pages.flatMap(page =>
        page.reviews.map((review: any) => review.id)
      );
      if (allReviewIds.length > 0) {
        setFrozenReviewOrder(allReviewIds);
      }
    }
  }, [reviewsData]);

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
  // Skip on first rating selection - only animate on subsequent changes
  useEffect(() => {
    // Only animate if tags actually changed
    if (displayedTags.length > 0 && JSON.stringify(displayedTags) !== JSON.stringify(availableTags)) {
      // Skip animation on first rating selection, just mark as done
      if (!hasSetRatingOnce.current) {
        hasSetRatingOnce.current = true;
        return;
      }
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
    onSuccess: (response: any) => {
      // Mark this fight as needing animation
      setPendingRatingAnimation(fight.id);

      // Optimistically update the userReview in cache immediately
      // This prevents the race condition where auto-upvote cancels the refetch
      if (response?.data?.review) {
        queryClient.setQueryData(['fight', fight.id, isAuthenticated], (old: any) => {
          if (!old?.fight) return old;
          const existingReview = old.fight.userReview;
          return {
            ...old,
            fight: {
              ...old.fight,
              userReview: {
                ...response.data.review,
                // Preserve existing fields or set defaults for new reviews
                upvotes: existingReview?.upvotes ?? 0,
                userHasUpvoted: existingReview?.userHasUpvoted ?? false,
                replies: existingReview?.replies ?? [],
              },
              userRating: response.data.rating,
            },
          };
        });
      } else if (response?.data && response.data.review === null) {
        // Handle review deletion
        queryClient.setQueryData(['fight', fight.id, isAuthenticated], (old: any) => {
          if (!old?.fight) return old;
          return {
            ...old,
            fight: {
              ...old.fight,
              userReview: null,
              userRating: response.data.rating,
            },
          };
        });
      }

      // Invalidate other queries that need fresh data
      queryClient.invalidateQueries({ queryKey: ['fightTags', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightReviews', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightStats', fight.id] }); // This fetches both prediction and aggregate stats
      queryClient.invalidateQueries({ queryKey: ['eventFights', fight.event.id] });
      queryClient.invalidateQueries({ queryKey: ['topRecentFights'] });
      // Invalidate fight list queries so cards update when navigating back
      queryClient.invalidateQueries({ queryKey: ['fights'] });
      queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
      queryClient.invalidateQueries({ queryKey: ['myRatings'] });
      queryClient.invalidateQueries({ queryKey: ['pastEvents'] }); // Past events screen embeds fights
      onRatingSuccess?.();
    },
    onError: (error: any) => {
      console.error('Update error:', error);
      showError(error?.error || 'Failed to save data', 'Error');
    },
  });

  // Upvote mutation with optimistic updates to prevent layout shifts
  const upvoteMutation = useMutation({
    mutationFn: ({ reviewId }: { reviewId: string }) =>
      apiService.toggleReviewUpvote(fight.id, reviewId),
    onMutate: async ({ reviewId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['fightReviews', fight.id] });
      await queryClient.cancelQueries({ queryKey: ['fight', fight.id, isAuthenticated] });

      // Snapshot previous values
      const previousReviews = queryClient.getQueryData(['fightReviews', fight.id]);
      const previousFight = queryClient.getQueryData(['fight', fight.id, isAuthenticated]);

      // Helper to toggle upvote on an item
      const toggleUpvote = (item: any) => ({
        ...item,
        userHasUpvoted: !item.userHasUpvoted,
        upvotes: item.userHasUpvoted ? Math.max(0, (item.upvotes || 1) - 1) : (item.upvotes || 0) + 1,
      });

      // Check if this is the user's own top-level review
      const isUserOwnReview = fight.userReview?.id === reviewId;
      // Check if this is a reply to the user's own review
      const isReplyToUserReview = fight.userReview?.replies?.some((r: any) => r.id === reviewId);

      if (isUserOwnReview) {
        // Update the fight cache for user's own review (displayed from fight.userReview)
        queryClient.setQueryData(['fight', fight.id, isAuthenticated], (old: any) => {
          if (!old?.fight?.userReview) return old;
          return {
            ...old,
            fight: {
              ...old.fight,
              userReview: toggleUpvote(old.fight.userReview),
            },
          };
        });
      } else if (isReplyToUserReview) {
        // Update a reply to the user's own review
        queryClient.setQueryData(['fight', fight.id, isAuthenticated], (old: any) => {
          if (!old?.fight?.userReview?.replies) return old;
          return {
            ...old,
            fight: {
              ...old.fight,
              userReview: {
                ...old.fight.userReview,
                replies: old.fight.userReview.replies.map((reply: any) =>
                  reply.id === reviewId ? toggleUpvote(reply) : reply
                ),
              },
            },
          };
        });
      } else {
        // Update the reviews cache for other users' reviews and replies
        queryClient.setQueryData(['fightReviews', fight.id], (old: any) => {
          if (!old?.pages) return old;

          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              reviews: page.reviews.map((review: any) => {
                // Check if this top-level review is being upvoted
                if (review.id === reviewId) {
                  return toggleUpvote(review);
                }

                // If not the top-level review, check if any of its replies match
                if (review.replies && review.replies.length > 0) {
                  let replyUpdated = false;
                  const updatedReplies = review.replies.map((reply: any) => {
                    if (reply.id === reviewId) {
                      replyUpdated = true;
                      return toggleUpvote(reply);
                    }
                    return reply;
                  });

                  // Only return new object if a reply was actually updated
                  if (replyUpdated) {
                    return { ...review, replies: updatedReplies };
                  }
                }

                // No changes needed for this review
                return review;
              }),
            })),
          };
        });
      }

      return { previousReviews, previousFight };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousReviews) {
        queryClient.setQueryData(['fightReviews', fight.id], context.previousReviews);
      }
      if (context?.previousFight) {
        queryClient.setQueryData(['fight', fight.id, isAuthenticated], context.previousFight);
      }
    },
    onSettled: () => {
      // Only invalidate top comments cache (for other screens), not the reviews on this screen
      queryClient.invalidateQueries({ queryKey: ['topComments'] });
    },
  });

  // Manual save handler for comment
  const handleSaveComment = async () => {
    // Require email verification
    if (!requireVerification('post a review')) return;

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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
    // Only require verification when opening the form, not when closing
    if (!showCommentForm) {
      if (!requireVerification('add a review')) return;
    }
    setShowCommentForm(!showCommentForm);
    // Native keyboard behavior will handle scrolling when input is focused
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

  // Reply to review mutation
  const saveReplyMutation = useMutation({
    mutationFn: async ({ reviewId, content }: { reviewId: string; content: string }) => {
      return apiService.createFightReviewReply(fight.id, reviewId, content);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['fightReviews', fight.id] });
      setReplyingToReviewId(null);
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
        showError('This review has reached the maximum number of replies (10)');
      } else {
        showError(error?.error || error?.message || 'Failed to save reply. Please try again later');
      }
    },
  });

  const editReplyMutation = useMutation({
    mutationFn: async ({ reviewId, content }: { reviewId: string; content: string }) => {
      return apiService.updateFightReview(fight.id, reviewId, content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fightReviews', fight.id] });
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
          editReplyMutation.mutate({ reviewId: replyId, content: '' });
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
    editReplyMutation.mutate({ reviewId: replyId, content: editReplyText.trim() });
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
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id, isAuthenticated] });
    },
    onError: (error: any) => {
      showError(error?.error || 'Failed to reveal outcome');
    },
  });

  const handleRevealOutcome = () => {
    setHasLocallyRevealed(true);
    revealOutcomeMutation.mutate();
  };

  // Winner data is always visible
  const isOutcomeRevealed = true;

  // Pre-flight comment upvote mutation (handles both top-level comments and replies)
  const upvotePreFightCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return apiService.togglePreFightCommentUpvote(fight.id, commentId);
    },
    onMutate: async (commentId) => {
      setUpvotingCommentId(commentId);

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['preFightComments', fight.id] });
      const previousComments = queryClient.getQueryData(['preFightComments', fight.id]);

      // Optimistic update - handles both top-level comments and nested replies
      queryClient.setQueryData(['preFightComments', fight.id], (old: any) => {
        if (!old) return old;

        const updatedComments = old.comments.map((c: any) => {
          // Check if this is the comment to update
          if (c.id === commentId) {
            return { ...c, upvotes: c.userHasUpvoted ? c.upvotes - 1 : c.upvotes + 1, userHasUpvoted: !c.userHasUpvoted };
          }
          // Check if the comment is in this comment's replies
          if (c.replies && c.replies.length > 0) {
            const updatedReplies = c.replies.map((r: any) =>
              r.id === commentId
                ? { ...r, upvotes: r.userHasUpvoted ? r.upvotes - 1 : r.upvotes + 1, userHasUpvoted: !r.userHasUpvoted }
                : r
            );
            return { ...c, replies: updatedReplies };
          }
          return c;
        });

        return { ...old, comments: updatedComments };
      });

      return { previousComments };
    },
    onSuccess: (data, commentId) => {
      // Update with actual server response - handles both top-level comments and nested replies
      queryClient.setQueryData(['preFightComments', fight.id], (old: any) => {
        if (!old) return old;

        const updatedComments = old.comments.map((c: any) => {
          // Check if this is the comment to update
          if (c.id === commentId) {
            return { ...c, upvotes: data.upvotes, userHasUpvoted: data.userHasUpvoted };
          }
          // Check if the comment is in this comment's replies
          if (c.replies && c.replies.length > 0) {
            const updatedReplies = c.replies.map((r: any) =>
              r.id === commentId
                ? { ...r, upvotes: data.upvotes, userHasUpvoted: data.userHasUpvoted }
                : r
            );
            return { ...c, replies: updatedReplies };
          }
          return c;
        });

        return { ...old, comments: updatedComments };
      });
      setUpvotingCommentId(null);
    },
    onError: (err: any, commentId, context: any) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(['preFightComments', fight.id], context.previousComments);
      }
      setUpvotingCommentId(null);
    },
  });

  const handleUpvoteComment = (commentId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!requireVerification('upvote a comment')) return;
    upvotePreFightCommentMutation.mutate(commentId);
  };

  const handleUpvoteReview = (reviewId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!requireVerification('upvote a review')) return;
    upvoteMutation.mutate({ reviewId });
  };

  const handleFlagComment = (commentId: string) => {
    if (!requireVerification('flag a comment')) return;
    setCommentToFlag(commentId);
    setFlagModalVisible(true);
  };

  const submitFlagComment = (reason: string) => {
    if (commentToFlag) {
      apiService.flagPreFightComment(fight.id, commentToFlag, reason)
        .then(() => {
          setFlagModalVisible(false);
          setCommentToFlag(null);
          showSuccess('Comment flagged successfully');
        })
        .catch((error: any) => {
          showError(error?.error || 'Failed to flag comment');
        });
    }
  };

  const handleFlagReview = (reviewId: string) => {
    if (!requireVerification('flag a review')) return;
    setReviewToFlag(reviewId);
    setFlagModalVisible(true);
  };

  const submitFlagReview = (reason: string) => {
    if (reviewToFlag) {
      flagReviewMutation.mutate({ reviewId: reviewToFlag, reason });
    }
  };

  const handleReplyClick = (reviewId: string) => {
    if (!requireVerification('reply to a review')) return;
    setReplyingToReviewId(reviewId);
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

    const targetPosition = targetNumber === 0 ? 1150 : (10 - targetNumber) * 115;

    Animated.timing(wheelAnimation, {
      toValue: targetPosition,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  // Handlers for rating and tags (immediate save) - Simplified like UpcomingFightDetailScreen
  const handleSetRating = (newRating: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!requireVerification('rate this fight')) return;
    const finalRating = rating === newRating ? 0 : newRating;

    setRating(finalRating);

    // Only refresh tags on subsequent rating selections, not the first one
    if (hasSetRatingOnce.current) {
      setTagRandomSeed(prev => prev + 1);
    }

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!requireVerification('tag this fight')) return;

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

        {/* Winner Section */}
        <SectionContainer
          title="Winner"
          icon="trophy"
          iconColor="#fff"
          headerBgColor="#166534"
          containerBgColorDark="rgba(34, 197, 94, 0.05)"
          containerBgColorLight="rgba(34, 197, 94, 0.08)"
        >
          {/* Reveal Button */}
          {fight.winner && !isOutcomeRevealed && (
            <View style={{ alignItems: 'flex-end', marginBottom: 8 }}>
              <TouchableOpacity
                onPress={handleRevealOutcome}
                style={[
                  styles.inlineTagButton,
                  {
                    backgroundColor: 'transparent',
                    borderColor: colors.border,
                  }
                ]}
              >
                <Text style={[
                  styles.inlineTagText,
                  {
                    color: colors.text
                  }
                ]}>
                  Reveal Winner
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Winner Content */}
          {!fight.winner && (
            <Text style={[styles.whatHappenedPromptText, { color: colors.textSecondary, textAlign: 'center' }]}>
              Outcome data not yet available.
            </Text>
          )}

          <View style={[styles.whatHappenedContainer, { marginTop: !fight.winner ? 0 : 8, alignItems: 'flex-start', marginBottom: 0 }]}>
            {/* Fighter 1 */}
            <View style={styles.whatHappenedFighter}>
              <View style={[
                styles.whatHappenedImageContainer,
                { borderWidth: 3, borderColor: isOutcomeRevealed && fight.winner === fight.fighter1.id ? '#166534' : 'transparent' }
              ]}>
                <Image
                  key={`fighter1-winner-${fight.fighter1.id}`}
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
              <View style={{ height: 24, marginTop: 4, justifyContent: 'center' }}>
                {isOutcomeRevealed && fight.winner === fight.fighter1.id && (
                  <Text style={{ color: '#4CAF50', fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
                    by {fight.method?.includes('Decision') ? 'Decision' : (fight.method || 'Unknown')}
                    {fight.round && !fight.method?.includes('Decision') && ` R${fight.round}`}
                    {fight.time && ` ${fight.time}`}
                  </Text>
                )}
              </View>
            </View>

            {/* Fighter 2 */}
            <View style={styles.whatHappenedFighter}>
              <View style={[
                styles.whatHappenedImageContainer,
                { borderWidth: 3, borderColor: isOutcomeRevealed && fight.winner === fight.fighter2.id ? '#166534' : 'transparent' }
              ]}>
                <Image
                  key={`fighter2-winner-${fight.fighter2.id}`}
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
              <View style={{ height: 24, marginTop: 4, justifyContent: 'center' }}>
                {isOutcomeRevealed && fight.winner === fight.fighter2.id && (
                  <Text style={{ color: '#4CAF50', fontSize: 13, textAlign: 'center', fontWeight: '600' }}>
                    by {fight.method?.includes('Decision') ? 'Decision' : (fight.method || 'Unknown')}
                    {fight.round && !fight.method?.includes('Decision') && ` R${fight.round}`}
                    {fight.time && ` ${fight.time}`}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Section Divider - My Prediction & Hype */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 12, paddingHorizontal: 16 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>WAS MY PICK CORRECT?</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border, marginLeft: 12, marginRight: 12, maxWidth: 80 }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>HOW HYPED</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>WAS I?</Text>
            </View>
          </View>

          {/* Prediction & Hype Content */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }}>
              {/* Left: Winner and Method Prediction */}
              {fight.userPredictedWinner ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  {/* Fighter Headshot */}
                  <Image
                    source={
                      fight.userPredictedWinner === fight.fighter1.id
                        ? (fight.fighter1.profileImage ? { uri: fight.fighter1.profileImage } : getFighterPlaceholderImage(fight.fighter1.id))
                        : (fight.fighter2.profileImage ? { uri: fight.fighter2.profileImage } : getFighterPlaceholderImage(fight.fighter2.id))
                    }
                    style={{ width: 70, height: 70, borderRadius: 35 }}
                  />
                  {/* Fighter Name and Method */}
                  <View>
                    {/* Winner Row with Accuracy Icon */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={[styles.predictionText, { color: colors.text, fontWeight: '700', fontSize: 17 }]}>
                        {fight.userPredictedWinner === fight.fighter1.id ? fight.fighter1.lastName : fight.fighter2.lastName}
                      </Text>
                      {(() => {
                        const isWinnerCorrect = fight.winner === fight.userPredictedWinner;
                        return (
                          <FontAwesome
                            name={isWinnerCorrect ? "check-circle" : "times-circle"}
                            size={22}
                            color={isWinnerCorrect ? "#4CAF50" : "#F44336"}
                          />
                        );
                      })()}
                    </View>
                    {/* Method Row with Accuracy Icon - only show if method was predicted */}
                    {fight.userPredictedMethod && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.predictionText, { color: colors.textSecondary, fontSize: 14 }]}>
                          by {fight.userPredictedMethod.charAt(0).toUpperCase() + fight.userPredictedMethod.slice(1).toLowerCase().replace('_', '/')}
                        </Text>
                        {(() => {
                          const isWinnerCorrect = fight.winner === fight.userPredictedWinner;
                          const normalizedActualMethod = normalizeMethod(fight.method);
                          const normalizedPredictedMethod = fight.userPredictedMethod?.toUpperCase();
                          const methodMatchesActual = normalizedActualMethod === normalizedPredictedMethod;

                          // Icon color logic:
                          // - If winner wrong: gray (irrelevant, doesn't count)
                          // - If winner correct + method correct: green checkmark
                          // - If winner correct + method wrong: gray X
                          const methodIconColor = !isWinnerCorrect
                            ? colors.textSecondary // gray if winner wrong (irrelevant)
                            : (methodMatchesActual ? "#4CAF50" : colors.textSecondary); // green if correct, gray if wrong

                          const methodIcon = methodMatchesActual ? "check-circle" : "times-circle";

                          return (
                            <FontAwesome
                              name={methodIcon}
                              size={18}
                              color={methodIconColor}
                            />
                          );
                        })()}
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <Text style={[styles.predictionText, { color: colors.textSecondary, fontStyle: 'italic' }]}>
                  No picks
                </Text>
              )}

              {/* Right: My Hype - Large flame icon with number */}
              <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 35 }}>
                {fight.userHypePrediction !== null && fight.userHypePrediction !== undefined && fight.userHypePrediction > 0 ? (
                  <View style={{ position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
                    <FontAwesome6
                      name="fire-flame-curved"
                      size={50}
                      color={getHypeHeatmapColor(fight.userHypePrediction)}
                    />
                    <Text style={{
                      position: 'absolute',
                      top: 14,
                      fontSize: 20,
                      fontWeight: 'bold',
                      color: '#FFFFFF',
                      textShadowColor: 'rgba(0,0,0,0.8)',
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}>
                      {Math.round(fight.userHypePrediction).toString()}
                    </Text>
                  </View>
                ) : (
                  <FontAwesome6
                    name="fire-flame-curved"
                    size={50}
                    color={colors.textSecondary}
                    style={{ opacity: 0.3 }}
                  />
                )}
              </View>
            </View>

          </SectionContainer>

        {/* My Rating Section */}
        <SectionContainer
          title="My Reaction"
          icon="star"
        >
          {/* Section Divider - How Good Was This Fight */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <View style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>HOW GOOD WAS THIS FIGHT?</Text>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Inline Rating Section */}
          <View style={[styles.section, { backgroundColor: 'transparent', borderWidth: 0, marginTop: -8 }]}>
            {/* Centered Star Display */}
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
              <View style={styles.animatedFlameContainer}>
                <View style={styles.wheelContainer} pointerEvents="none">
                  <Animated.View style={[
                    styles.wheelNumbers,
                    {
                      transform: [{
                        translateY: wheelAnimation.interpolate({
                          inputRange: [0, 1150],
                          outputRange: [487, -663],
                        })
                      }]
                    }
                  ]}>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((number) => {
                      const ratingColor = getHypeHeatmapColor(number);

                      return (
                        <View key={number} style={styles.ratingWheelBoxContainer}>
                          <View style={styles.ratingStarContainer}>
                            <FontAwesome
                              name="star"
                              size={90}
                              color={ratingColor}
                            />
                            <Text style={styles.ratingStarText}>{number}</Text>
                          </View>
                        </View>
                      );
                    })}
                    {/* Grey placeholder star - shown when no rating selected */}
                    <View style={styles.ratingWheelBoxContainer}>
                      <View style={styles.ratingStarContainer}>
                        <FontAwesome
                          name="star-o"
                          size={90}
                          color="#666666"
                        />
                      </View>
                    </View>
                  </Animated.View>
                </View>
              </View>
            </View>

            {/* Row of selectable stars (1-10) */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: -5, width: '100%' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
                const isSelected = level <= rating;
                const starColor = isSelected ? getHypeHeatmapColor(level) : '#808080';

                return (
                  <TouchableOpacity
                    key={level}
                    onPress={() => handleSetRating(level)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    style={{ paddingHorizontal: 2.5 }}
                  >
                    <FontAwesome
                      name={isSelected ? "star" : "star-o"}
                      size={31}
                      color={starColor}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Section Divider - Tags */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 30 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <View style={{ paddingHorizontal: 12 }}>
              <FontAwesome name="hashtag" size={20} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Tags Content */}
          {/* Tags stay in their current order - only reorder when rating stars are tapped */}
          {displayedTags.length > 0 && (() => {
              return (
                <View style={styles.inlineTagsSection}>
                  <View style={styles.inlineTagsContainer}>
                    {displayedTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id);
                      return (
                        <Animated.View
                          key={tag.id}
                          style={{ opacity: isSelected ? 1 : tagsOpacity }}
                        >
                          <View style={styles.tagWithBadge}>
                            <TouchableOpacity
                              onPress={() => handleToggleTag(tag.id)}
                              style={[
                                styles.inlineTagButton,
                                {
                                  backgroundColor: isSelected ? colors.primary : 'transparent',
                                  borderColor: colors.border,
                                }
                              ]}
                            >
                              <Text style={[
                                styles.inlineTagText,
                                {
                                  color: isSelected ? colors.textOnAccent : colors.textSecondary
                                }
                              ]}>
                                {tag.name}
                              </Text>
                            </TouchableOpacity>
                            {tag.count > 0 && (
                              <View style={[
                                styles.tagCountBadge,
                                {
                                  backgroundColor: isSelected ? colors.primary : colors.card,
                                  borderColor: isSelected ? colors.primary : colors.border
                                }
                              ]}>
                                <Text style={[styles.tagCountBadgeText, { color: isSelected ? colors.textOnAccent : colors.textSecondary }]}>
                                  {tag.count}
                                </Text>
                              </View>
                            )}
                          </View>
                        </Animated.View>
                      );
                    })}
                  </View>
                </View>
              );
            })()}
        </SectionContainer>

        {/* ALL REACTIONS Section */}
        <SectionContainer
          title="Crowd Reactions"
          icon="users"
          iconColor="#000"
          headerBgColor="#83B4F3"
          containerBgColorDark="rgba(131, 180, 243, 0.05)"
          containerBgColorLight="rgba(131, 180, 243, 0.08)"
        >
          {/* Section Divider - All Ratings */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <View style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>FIGHT RATINGS ({totalRatings || 0})</Text>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Community Rating Layout: Horizontal */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 0 }}>
            {/* Community Rating Box (like CompletedFightCard) */}
            {(() => {
              const ratingColor = fight.averageRating > 0
                ? getHypeHeatmapColor(Math.round(fight.averageRating))
                : colors.border;

              return (
                <View style={{ position: 'relative', width: 90, height: 105, justifyContent: 'center', alignItems: 'center' }}>
                  <View style={{
                    width: 80,
                    height: 90,
                    borderRadius: 12,
                    backgroundColor: fight.averageRating > 0 ? ratingColor : 'transparent',
                    borderWidth: fight.averageRating > 0 ? 0 : 1,
                    borderColor: colors.textSecondary,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    <FontAwesome
                      name="star"
                      size={28}
                      color={fight.averageRating > 0 ? 'rgba(0,0,0,0.45)' : colors.textSecondary}
                      style={fight.averageRating > 0 ? {} : { opacity: 0.5 }}
                    />
                    {fight.averageRating > 0 && (
                      <Text style={{
                        fontSize: 28,
                        fontWeight: 'bold',
                        color: '#FFFFFF',
                        textShadowColor: 'rgba(0,0,0,0.7)',
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 3,
                      }}>
                        {fight.averageRating % 1 === 0
                          ? fight.averageRating.toString()
                          : fight.averageRating.toFixed(1)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* Rating Distribution Chart */}
            {aggregateStats?.ratingDistribution && (
              <View style={{ flex: 1, marginLeft: -10 }}>
                <RatingDistributionChart
                  distribution={aggregateStats.ratingDistribution}
                  totalRatings={totalRatings}
                />
              </View>
            )}
          </View>

          {/* Pre-Fight Header Divider */}
          <View style={{
            marginTop: 45,
            marginBottom: -4,
            backgroundColor: 'rgba(128, 128, 128, 0.05)',
            paddingVertical: 10,
            alignItems: 'center',
          }}>
            <Text style={{
              color: colors.text,
              fontSize: 16,
              fontWeight: '700',
              letterSpacing: 1,
            }}>PRE-FIGHT</Text>
          </View>

          {/* All Predictions Content */}
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
              <PredictionBarChart
                fighter1Name={fight.fighter1.lastName}
                fighter2Name={fight.fighter2.lastName}
                fighter1Id={fight.fighter1.id}
                fighter2Id={fight.fighter2.id}
                fighter1Image={fight.fighter1.profileImage}
                fighter2Image={fight.fighter2.profileImage}
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
            );
          })()}

          {/* Section Divider - Hype */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <View style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>HYPE ({predictionStats?.totalPredictions || 0})</Text>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Hype Content */}
          {predictionStats?.averageHype !== null && predictionStats?.averageHype !== undefined && predictionStats.averageHype > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 0 }}>
              {/* Community Hype Box (like UpcomingFightCard) */}
              <View style={{ position: 'relative', width: 90, height: 105, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{
                  width: 80,
                  height: 90,
                  borderRadius: 12,
                  backgroundColor: getHypeHeatmapColor(predictionStats.averageHype),
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <FontAwesome6
                    name="fire-flame-curved"
                    size={28}
                    color="rgba(0,0,0,0.45)"
                  />
                  <Text style={{
                    fontSize: 28,
                    fontWeight: 'bold',
                    color: '#FFFFFF',
                    textShadowColor: 'rgba(0,0,0,0.7)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  }}>
                    {predictionStats.averageHype === 10 ? '10' : predictionStats.averageHype.toFixed(1)}
                  </Text>
                </View>
              </View>

              {/* Hype Distribution Chart */}
              {predictionStats?.distribution && (
                <View style={{ flex: 1, marginLeft: -10 }}>
                  <HypeDistributionChart
                    distribution={predictionStats.distribution}
                    totalPredictions={predictionStats.totalPredictions || 0}
                    hasRevealedHype={true}
                    fadeAnim={new Animated.Value(1)}
                  />
                </View>
              )}
            </View>
          ) : (
            <Text style={[styles.predictionText, { color: colors.textSecondary, fontStyle: 'italic' }]}>
              No community hype data
            </Text>
          )}
        </SectionContainer>

        {/* COMMENTS Section */}
        <SectionContainer
          title="COMMENTS"
          icon="comment"
          iconColor="#fff"
          headerBgColor="#4a4a4a"
          containerBgColorDark="rgba(74, 74, 74, 0.15)"
          containerBgColorLight="rgba(74, 74, 74, 0.08)"
          headerRight={
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
              ({(fight.userReview ? 1 : 0) + (reviewsData?.pages?.flatMap(p => p.reviews)?.filter((r: any) => r.userId !== user?.id)?.reduce((acc: number, r: any) => acc + 1 + (r.replies?.length || 0), 0) || 0)})
            </Text>
          }
        >
          {/* Comments Tab Toggle */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setCommentsTab('postfight')}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: commentsTab === 'postfight' ? colors.primary : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: '500',
              color: commentsTab === 'postfight' ? colors.textOnAccent : colors.textSecondary,
            }}>
              Post-Fight
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCommentsTab('preflight')}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: commentsTab === 'preflight' ? colors.primary : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: '500',
              color: commentsTab === 'preflight' ? colors.textOnAccent : colors.textSecondary,
            }}>
              Pre-Fight
            </Text>
          </TouchableOpacity>
        </View>

        {/* Post-Fight Comments Section */}
        {commentsTab === 'postfight' && (
        <View style={[styles.sectionNoBorder, { marginTop: 10, marginHorizontal: 0, padding: 0 }]}>
            {/* Only show header row when a button is visible */}
            {(!fight.userReview || isEditingComment) && (
            <View style={[styles.commentHeaderRow, { justifyContent: 'center' }]}>
              {!fight.userReview && !isEditingComment && !showCommentForm && (
                <Button
                  onPress={handleToggleCommentForm}
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
              {!fight.userReview && !isEditingComment && showCommentForm && (
                <Button
                  onPress={handleToggleCommentForm}
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
                    setComment(fight.userReview?.content || '');
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
            )}

            {/* Post-Flight Reviews Content */}
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
                        placeholder="Comment on this fight."
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
                          borderWidth: (fight.userReview || comment.trim().length > 0) ? 0 : 1,
                          borderColor: colors.border,
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
              <>
              <View style={{ marginTop: 0 }}>
                <CommentCard
                  comment={{
                    id: fight.userReview.id,
                    content: fight.userReview.content,
                    rating: rating,
                    upvotes: fight.userReview.upvotes || 0,
                    userHasUpvoted: fight.userReview.userHasUpvoted,
                    predictedWinner: fight.userPredictedWinner,
                    predictedMethod: fight.userPredictedMethod,
                    user: {
                      displayName: user?.displayName || 'You',
                    },
                  }}
                  fighter1Id={fight.fighter1.id}
                  fighter2Id={fight.fighter2.id}
                  fighter1Name={fight.fighter1.lastName}
                  fighter2Name={fight.fighter2.lastName}
                  onEdit={() => setIsEditingComment(true)}
                  onUpvote={() => handleUpvoteReview(fight.userReview.id)}
                  isUpvoting={upvoteMutation.isPending}
                  isAuthenticated={isAuthenticated}
                  showMyReview={true}
                />
              </View>

              {/* Display replies to user's own review */}
              {fight.userReview.replies && fight.userReview.replies.length > 0 && (() => {
                const userReviewReplies = fight.userReview.replies;
                const isExpanded = expandedReplies[fight.userReview.id] || false;
                const repliesToShow = isExpanded ? userReviewReplies : userReviewReplies.slice(0, INITIAL_REPLIES_SHOWN);
                const hiddenCount = userReviewReplies.length - INITIAL_REPLIES_SHOWN;

                return (
                  <View style={{ marginLeft: 20, marginBottom: 20 }}>
                    {repliesToShow.map((reply: any) => {
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
                            <CommentCard
                              comment={{
                                id: reply.id,
                                content: reply.content,
                                rating: isMyReply ? rating : (reply.rating || 0),
                                upvotes: reply.upvotes || 0,
                                userHasUpvoted: reply.userHasUpvoted || false,
                                predictedWinner: isMyReply ? fight.userPredictedWinner : reply.predictedWinner,
                                predictedMethod: isMyReply ? fight.userPredictedMethod : reply.predictedMethod,
                                user: {
                                  displayName: reply.user.displayName || `${reply.user.firstName} ${reply.user.lastName}`,
                                },
                              }}
                              fighter1Id={fight.fighter1.id}
                              fighter2Id={fight.fighter2.id}
                              fighter1Name={fight.fighter1.lastName}
                              fighter2Name={fight.fighter2.lastName}
                              onUpvote={() => handleUpvoteReview(reply.id)}
                              onFlag={() => handleFlagReview(reply.id)}
                              onEdit={isMyReply ? () => {
                                setEditingReplyId(reply.id);
                                setEditReplyText(reply.content);
                              } : undefined}
                              isUpvoting={upvoteMutation.isPending}
                              isAuthenticated={isAuthenticated}
                              showMyReview={isMyReply}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                    {/* Show more/less replies button */}
                    {hiddenCount > 0 && (
                      <TouchableOpacity
                        onPress={() => setExpandedReplies(prev => ({ ...prev, [fight.userReview.id]: !isExpanded }))}
                        style={{ marginTop: -7, paddingVertical: 8, alignSelf: 'flex-end' }}
                      >
                        <Text style={{ color: colors.tint, fontSize: 14, fontWeight: '500' }}>
                          {isExpanded ? 'Show less replies' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'reply' : 'replies'}`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}
              </>
            )}

            {/* Other reviews with infinite scroll */}
            {reviewsData?.pages[0]?.reviews && reviewsData.pages[0]?.reviews.length > 0 ? (
              <View style={{ marginTop: 0 }}>
                {(() => {
                  // Get all reviews and filter out user's own
                  const allReviews = reviewsData.pages.flatMap(page =>
                    page.reviews.filter((review: any) => review.userId !== user?.id)
                  );
                  // Sort by frozen order to prevent layout shifts from upvotes
                  const sortedReviews = frozenReviewOrder.length > 0
                    ? [...allReviews].sort((a, b) => {
                        const aIndex = frozenReviewOrder.indexOf(a.id);
                        const bIndex = frozenReviewOrder.indexOf(b.id);
                        // New reviews (not in frozen order) go at the end
                        if (aIndex === -1 && bIndex === -1) return 0;
                        if (aIndex === -1) return 1;
                        if (bIndex === -1) return -1;
                        return aIndex - bIndex;
                      })
                    : allReviews;
                  return sortedReviews;
                })().map((review: any) => {
                  // Check if user has already replied to this review
                  const userHasReplied = review.replies?.some((reply: any) => reply.user?.id === user?.id);

                  return (
                  <React.Fragment key={review.id}>
                    <View>
                      <CommentCard
                        comment={{
                          id: review.id,
                          content: review.content,
                          rating: review.rating,
                          upvotes: review.upvotes || 0,
                          userHasUpvoted: review.userHasUpvoted,
                          predictedWinner: review.predictedWinner,
                          predictedMethod: review.predictedMethod,
                          user: {
                            displayName: review.user.displayName || `${review.user.firstName} ${review.user.lastName}`,
                          },
                        }}
                        fighter1Id={fight.fighter1.id}
                        fighter2Id={fight.fighter2.id}
                        fighter1Name={fight.fighter1.lastName}
                        fighter2Name={fight.fighter2.lastName}
                        onUpvote={() => handleUpvoteReview(review.id)}
                        onFlag={() => handleFlagReview(review.id)}
                        onReply={userHasReplied ? undefined : () => handleReplyClick(review.id)}
                        isUpvoting={upvoteMutation.isPending}
                        isFlagging={flagReviewMutation.isPending && reviewToFlag === review.id}
                        isAuthenticated={isAuthenticated}
                      />
                    </View>

                    {/* Reply form - shown when replying to this review */}
                    {replyingToReviewId === review.id && (
                      <View ref={replyInputRef} collapsable={false} style={{ marginLeft: 20, marginTop: 8, marginBottom: 12 }}>
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
                                saveReplyMutation.mutate({ reviewId: review.id, content: replyText.trim() });
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
                              setReplyingToReviewId(null);
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
                    {review.replies && review.replies.length > 0 && (() => {
                      const isExpanded = expandedReplies[review.id] || false;
                      const repliesToShow = isExpanded ? review.replies : review.replies.slice(0, INITIAL_REPLIES_SHOWN);
                      const hiddenCount = review.replies.length - INITIAL_REPLIES_SHOWN;

                      return (
                        <View style={{ marginLeft: 20, marginTop: replyingToReviewId === review.id ? 50 : 0, marginBottom: 20 }}>
                          {repliesToShow.map((reply: any) => {
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
                                  <CommentCard
                                    comment={{
                                      id: reply.id,
                                      content: reply.content,
                                      rating: isMyReply ? rating : (reply.rating || 0),
                                      upvotes: reply.upvotes || 0,
                                      userHasUpvoted: reply.userHasUpvoted || false,
                                      predictedWinner: isMyReply ? fight.userPredictedWinner : reply.predictedWinner,
                                      predictedMethod: isMyReply ? fight.userPredictedMethod : reply.predictedMethod,
                                      user: {
                                        displayName: reply.user.displayName || `${reply.user.firstName} ${reply.user.lastName}`,
                                      },
                                    }}
                                    fighter1Id={fight.fighter1.id}
                                    fighter2Id={fight.fighter2.id}
                                    fighter1Name={fight.fighter1.lastName}
                                    fighter2Name={fight.fighter2.lastName}
                                    onUpvote={() => handleUpvoteReview(reply.id)}
                                    onFlag={() => handleFlagReview(reply.id)}
                                    onEdit={isMyReply ? () => {
                                      setEditingReplyId(reply.id);
                                      setEditReplyText(reply.content);
                                    } : undefined}
                                    isUpvoting={upvoteMutation.isPending}
                                    isAuthenticated={isAuthenticated}
                                    showMyReview={isMyReply}
                                  />
                                )}
                              </React.Fragment>
                            );
                          })}
                          {/* Show more/less replies button */}
                          {hiddenCount > 0 && (
                            <TouchableOpacity
                              onPress={() => setExpandedReplies(prev => ({ ...prev, [review.id]: !isExpanded }))}
                              style={{ marginTop: -7, paddingVertical: 8, alignSelf: 'flex-end' }}
                            >
                              <Text style={{ color: colors.tint, fontSize: 14, fontWeight: '500' }}>
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
            ) : !fight.userReview ? (
              <Text style={[styles.noReviewsText, { color: colors.textSecondary }]}>
                No reviews yet. Be the first to review this fight!
              </Text>
            ) : null}
        </View>
        )}

        {/* Pre-Flight Comments Section */}
        {commentsTab === 'preflight' && (
          <View style={[styles.sectionNoBorder, { marginTop: 10, marginHorizontal: 0, padding: 0 }]}>
            {preFightCommentsData && preFightCommentsData.comments && preFightCommentsData.comments.length > 0 ? (
              <View style={{ marginTop: 0 }}>
                {preFightCommentsData.comments.map((comment: any) => (
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
                        isAuthenticated={isAuthenticated}
                        showMyComment={comment.userId === user?.id}
                        onUpvote={() => handleUpvoteComment(comment.id)}
                        isUpvoting={upvotePreFightCommentMutation.isPending}
                      />
                    </View>

                    {/* Display replies to this comment */}
                    {comment.replies && comment.replies.length > 0 && (() => {
                      const isExpanded = expandedReplies[comment.id] || false;
                      const repliesToShow = isExpanded ? comment.replies : comment.replies.slice(0, INITIAL_REPLIES_SHOWN);
                      const hiddenCount = comment.replies.length - INITIAL_REPLIES_SHOWN;

                      return (
                        <View style={{ marginLeft: 40, marginBottom: 20 }}>
                          {repliesToShow.map((reply: any) => (
                            <PreFightCommentCard
                              key={reply.id}
                              comment={{
                                id: reply.id,
                                content: reply.content,
                                hypeRating: reply.hypeRating,
                                predictedWinner: reply.predictedWinner,
                                predictedMethod: reply.predictedMethod,
                                upvotes: reply.upvotes || 0,
                                userHasUpvoted: reply.userHasUpvoted || false,
                                user: {
                                  displayName: reply.user?.displayName || `${reply.user?.firstName} ${reply.user?.lastName}`,
                                },
                              }}
                              fighter1Id={fight.fighter1.id}
                              fighter2Id={fight.fighter2.id}
                              fighter1Name={fight.fighter1.lastName}
                              fighter2Name={fight.fighter2.lastName}
                              isAuthenticated={isAuthenticated}
                              showMyComment={reply.userId === user?.id}
                              onUpvote={() => handleUpvoteComment(reply.id)}
                              isUpvoting={upvotePreFightCommentMutation.isPending}
                            />
                          ))}
                          {/* Show more/less replies button */}
                          {hiddenCount > 0 && (
                            <TouchableOpacity
                              onPress={() => setExpandedReplies(prev => ({ ...prev, [comment.id]: !isExpanded }))}
                              style={{ marginTop: -7, paddingVertical: 8, alignSelf: 'flex-end' }}
                            >
                              <Text style={{ color: colors.tint, fontSize: 14, fontWeight: '500' }}>
                                {isExpanded ? 'Show less replies' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'reply' : 'replies'}`}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })()}
                  </React.Fragment>
                ))}
              </View>
            ) : (
              <Text style={[styles.noReviewsText, { color: colors.textSecondary }]}>
                No pre-fight comments were made for this fight.
              </Text>
            )}
          </View>
        )}
        </SectionContainer>

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

      </ScrollView>

      {/* Modals */}
      <FlagReviewModal
        visible={flagModalVisible}
        onClose={() => {
          setFlagModalVisible(false);
          setCommentToFlag(null);
        }}
        onSubmit={commentToFlag ? submitFlagComment : submitFlagReview}
        isLoading={flagReviewMutation.isPending}
        colorScheme={colorScheme}
      />

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
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  predictionText: {
    fontSize: 15,
    marginBottom: 4,
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
    width: 100,
    height: 100,
    borderRadius: 50,
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
  tagWithBadge: {
    position: 'relative',
  },
  tagCountBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tagCountBadgeText: {
    fontSize: 10,
    fontWeight: '600',
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
    paddingTop: 188,
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
  ratingWheelBoxContainer: {
    height: 115,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingWheelBox: {
    width: 48,
    height: 82,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  ratingWheelBoxText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ratingStarContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    width: 90,
    height: 105,
  },
  ratingStarText: {
    position: 'absolute',
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
    width: 106,
    height: 106,
    borderRadius: 53,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatHappenedImage: {
    width: 100,
    height: 100,
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
    marginBottom: 16,
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
  userHypeSquare: {
    width: 44,
    height: 73,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    gap: 2,
  },
  myHypeSquare: {
    width: 48,
    height: 82,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    gap: 2,
  },
  myHypeSquareNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  communityHypeSquare: {
    width: 48,
    height: 82,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    gap: 2,
  },
  communityHypeSquareText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  communityHypeSquareCount: {
    position: 'absolute',
    bottom: 9,
    color: 'rgba(0,0,0,0.5)',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  hypeSquareText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  userRatingContainer: {
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
  userRatingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5C518',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
    marginLeft: 10,
  },
  userRatingBadgeText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
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
    backgroundColor: '#83B4F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
    marginLeft: 10,
  },
  communityDataBadgeText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 1000,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});
