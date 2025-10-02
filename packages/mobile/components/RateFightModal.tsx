import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { apiService, type ApiError } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { AnalyticsService } from '../services/analytics';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from './CustomAlert';

interface Fight {
  id: string;
  fighter1: {
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
  };
  fighter2: {
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
  };
  event: {
    name: string;
    date: string;
  };
  userRating?: any;
  userReview?: any;
  userTags?: any[];
}

interface RateFightModalProps {
  visible: boolean;
  fight: Fight | null;
  onClose: () => void;
  queryKey?: string[];
  crewId?: string; // For sending crew messages
  onSuccess?: (type: 'rating' | 'review' | 'tags' | 'remove', data?: { fightId?: string; rating?: number | null }) => void;
}

// Comprehensive fight descriptors organized by rating tiers
const ALL_FIGHT_TAGS = [
  // EXCELLENT FIGHTS (9-10) - Exceptional experiences
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

  // GREAT FIGHTS (7-8) - High quality, entertaining
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

  // GOOD FIGHTS (5-6) - Decent, some highlights
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

  // POOR FIGHTS (4 and below) - Below expectations
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

  // UNIVERSAL TAGS - Can appear at any rating
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

// Function to get available tags based on rating with random selection (8-10 tags)
const getAvailableTagsForRating = (rating: number, selectedTags: string[]) => {
  let eligibleTags: typeof ALL_FIGHT_TAGS = [];

  if (rating >= 9) {
    // Excellent fights: 9-10 tags + universal tags
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      tag.minRating === 9 || (!tag.minRating && !tag.maxRating)
    );
  } else if (rating >= 7) {
    // Great fights: 7-8 tags + universal tags
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      tag.minRating === 7 || (!tag.minRating && !tag.maxRating)
    );
  } else if (rating >= 5) {
    // Good fights: 5-6 tags + universal tags
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      tag.minRating === 5 || (!tag.minRating && !tag.maxRating)
    );
  } else if (rating >= 1) {
    // Poor fights: 4 and below tags + universal tags
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      tag.maxRating === 4 || (!tag.minRating && !tag.maxRating)
    );
  } else {
    // No rating selected - show universal tags only
    eligibleTags = ALL_FIGHT_TAGS.filter(tag =>
      !tag.minRating && !tag.maxRating
    );
  }

  // Always include any tags that are already selected, even if they don't match the current rating
  const selectedTagObjects = ALL_FIGHT_TAGS.filter(tag => selectedTags.includes(tag.id));
  const mustIncludeTags = selectedTagObjects;

  // Remove already selected tags from eligible pool to avoid duplicates
  const unselectedEligibleTags = eligibleTags.filter(tag => !selectedTags.includes(tag.id));

  // Calculate tags to show based on estimated layout for exactly 3 rows
  // Average tag width: ~80px, gap: 8px, available width: ~320px (modal width - padding)
  // Tags per row: floor((320 + 8) / (80 + 8)) = ~3.7, so conservatively 3 per row
  // For exactly 3 rows: 3 tags × 3 rows = 9 tags maximum
  const TAGS_PER_ROW = 3;
  const MAX_ROWS = 3;
  const maxTags = TAGS_PER_ROW * MAX_ROWS; // 9 tags for exactly 3 rows
  const selectedCount = mustIncludeTags.length;
  const remainingSlots = Math.max(0, Math.min(maxTags - selectedCount, unselectedEligibleTags.length));
  const targetRandomCount = Math.max(0, Math.min(remainingSlots, maxTags - selectedCount));

  // If we have room for random selection, pick randomly
  let randomlySelectedTags: typeof ALL_FIGHT_TAGS = [];
  if (targetRandomCount > 0 && unselectedEligibleTags.length > 0) {
    const shuffled = shuffleArray(unselectedEligibleTags);
    randomlySelectedTags = shuffled.slice(0, targetRandomCount);
  }

  // Combine must-include tags with randomly selected tags
  const allTags = [...mustIncludeTags, ...randomlySelectedTags];

  // Conservative approach: Just use a fixed count based on typical tag lengths
  // This prevents the glitchy 4th row from ever appearing
  // Better to show slightly fewer tags than to have layout glitches
  const CONSERVATIVE_MAX_TAGS = 8; // Safe number that usually fits in 3 rows

  return allTags.slice(0, CONSERVATIVE_MAX_TAGS);
};

// Fighter image selection logic (same as FightDisplayCard)
const getFighterImage = (fighterId: string) => {
  const images = [
    require('../assets/fighters/fighter-1.jpg'),
    require('../assets/fighters/fighter-2.jpg'),
    require('../assets/fighters/fighter-3.jpg'),
    require('../assets/fighters/fighter-4.jpg'),
    require('../assets/fighters/fighter-5.jpg'),
    require('../assets/fighters/fighter-6.jpg'),
  ];

  // Use charCodeAt to get a number from the last character (works for letters and numbers)
  const lastCharCode = fighterId.charCodeAt(fighterId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export default function RateFightModal({ visible, fight, onClose, queryKey = ['fights'], crewId, onSuccess }: RateFightModalProps) {
  console.log('🎯 RateFightModal RENDER - Fight:', fight?.id, 'Visible:', visible);

  // Current form state
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagRandomSeed, setTagRandomSeed] = useState(0);

  // Original data state (what user had when modal opened)
  const [originalData, setOriginalData] = useState<{
    rating: number;
    comment: string;
    tags: string[];
    hasAnyData: boolean;
  }>({ rating: 0, comment: '', tags: [], hasAnyData: false });

  // Animation state for rolling numbers
  const [displayNumber, setDisplayNumber] = useState(0);
  const wheelAnimation = useRef(new Animated.Value(1200)).current;
  const starColorAnimation = useRef(new Animated.Value(0)).current;

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { alertState, showError, hideAlert } = useCustomAlert();

  // Calculate available tags based on current rating and preserve selected tags
  // Note: selectedTags is NOT in dependency array to prevent regeneration when user selects/deselects tags
  const availableTags = useMemo(() => {
    return getAvailableTagsForRating(rating, selectedTags);
  }, [rating, tagRandomSeed]);


  // Fetch fight data with user information for persistence
  const { data: fightWithUserData, isLoading: fightDataLoading } = useQuery({
    queryKey: ['fight', fight?.id, 'withUserData'],
    queryFn: async () => {
      if (fight?.id) {
        console.log('🎯 RateFightModal: Fetching fight data with user info for fightId:', fight.id);
        const result = await apiService.getFight(fight.id);
        console.log('🎯 RateFightModal: Fight API response:', result);
        return result;
      }
      return null;
    },
    enabled: !!fight?.id && visible,
    staleTime: 30 * 1000, // 30 seconds
  });

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
      setDisplayNumber(0);
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
      setDisplayNumber(targetNumber);
    }
  };

  // Custom setRating function that triggers tag re-randomization and animation
  const handleSetRating = (newRating: number) => {
    // If the same rating is selected, deselect it (set to 0)
    const finalRating = rating === newRating ? 0 : newRating;

    setRating(finalRating);
    animateToNumber(finalRating);

    // Animate star color transition
    Animated.timing(starColorAnimation, {
      toValue: finalRating > 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();

    // Trigger tag re-randomization when rating changes
    setTagRandomSeed(prev => prev + 1);
  };

  // Reset and initialize state when modal opens
  useEffect(() => {
    if (visible && fight) {
      console.log('🎯 RateFightModal: Initializing for fight:', fight.id);

      // Reset random seed for fresh tag selection
      setTagRandomSeed(Math.floor(Math.random() * 1000));

      // Reset star color animation
      starColorAnimation.setValue(0);

      // Use API data if available, otherwise use passed fight data
      const fightData = fightWithUserData?.fight || fight;
      console.log('🎯 Fight data available:', {
        hasApiData: !!fightWithUserData?.fight,
        userRating: fightData.userRating,
        userReview: fightData.userReview,
        userTags: fightData.userTags
      });

      // Extract existing data in priority order (review > rating)
      let currentRating = 0;
      let currentComment = '';
      let currentTags: string[] = [];

      // 1. Check for review data (most complete)
      if (fightData.userReview) {
        currentRating = fightData.userReview.rating || 0;
        currentComment = fightData.userReview.content || '';
        console.log('🎯 Found review data:', { rating: currentRating, hasContent: !!currentComment });
      }
      // 2. Check for standalone rating data if no review
      else if (fightData.userRating) {
        currentRating = typeof fightData.userRating === 'number'
          ? fightData.userRating
          : (fightData.userRating.rating || 0);
        console.log('🎯 Found rating data:', currentRating);
      }

      // 3. Extract existing tags
      if (fightData.userTags && fightData.userTags.length > 0) {
        currentTags = fightData.userTags.map((userTag: any) => {
          const tagName = typeof userTag === 'string'
            ? userTag.toLowerCase()
            : (userTag.tag?.name || userTag.name || '').toLowerCase();

          const frontendTag = ALL_FIGHT_TAGS.find(tag =>
            tag.name.toLowerCase() === tagName ||
            tag.id.toLowerCase() === tagName
          );
          return frontendTag?.id;
        }).filter(Boolean) as string[];
        console.log('🎯 Found tags:', currentTags);
      }

      // Store original state for comparison
      const hasAnyOriginalData = currentRating > 0 || !!currentComment || currentTags.length > 0;
      setOriginalData({
        rating: currentRating,
        comment: currentComment,
        tags: [...currentTags],
        hasAnyData: hasAnyOriginalData
      });

      // Set current form state
      setRating(currentRating);
      setComment(currentComment);
      setSelectedTags(currentTags);

      // Initialize wheel animation
      if (currentRating > 0) {
        const wheelPosition = (10 - currentRating) * 120;
        wheelAnimation.setValue(wheelPosition);
        setDisplayNumber(currentRating);
        // Set star color to primary for existing rating
        starColorAnimation.setValue(1);
      } else {
        wheelAnimation.setValue(1200);
        setDisplayNumber(0);
        // Set star color to grey if no rating
        starColorAnimation.setValue(0);
      }

      console.log('🎯 Modal initialized with:', {
        rating: currentRating,
        hasComment: !!currentComment,
        tagsCount: currentTags.length,
        hasAnyData: hasAnyOriginalData
      });
    }
  }, [visible, fight, fightWithUserData]);

  // Simple unified mutation - like PredictionModal pattern
  const updateUserDataMutation = useMutation({
    mutationFn: async (data: { rating: number | null; review: string | null; tags: string[]; }) => {
      return await apiService.updateFightUserData(fight!.id, data);
    },
    onSuccess: async () => {
      // Refresh data
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['fight', fight?.id, 'withUserData'] });

      // Pass the updated rating to parent for animation (use current form state)
      onSuccess?.('rating', { fightId: fight?.id, rating: rating });
      closeModal();
    },
    onError: (error: any) => {
      console.error('Update error:', error);
      showError(error?.error || 'Failed to save data', 'Error');
    },
  });

  const closeModal = () => {
    // Immediately trigger modal close
    onClose();

    // Delay state reset until after modal fade animation (typically 300ms)
    setTimeout(() => {
      setRating(0);
      setComment('');
      setSelectedTags([]);
      setTagRandomSeed(0);
      setDisplayNumber(0);
      setOriginalData({ rating: 0, comment: '', tags: [], hasAnyData: false });
      wheelAnimation.setValue(1200);
      starColorAnimation.setValue(0);
    }, 350);
  };

  const handleSave = () => {
    if (!fight) {
      showError('No fight selected', 'Error');
      return;
    }

    // Simple validation like PredictionModal
    if (comment.trim() && comment.trim().length < 3) {
      showError('Comments must be at least 3 characters long', 'Error');
      return;
    }

    if (comment.trim() && rating === 0) {
      showError('Reviews require a rating.', 'Error');
      return;
    }

    // Create data object like PredictionModal pattern
    const submissionData = {
      rating: rating > 0 ? rating : null,
      review: comment.trim() || null,
      tags: selectedTags
    };

    updateUserDataMutation.mutate(submissionData);
  };


  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const getFighterName = (fighter: any) => {
    return fighter.lastName;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!fight) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={closeModal}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalOverlayTouchable}
          activeOpacity={1}
          onPress={closeModal}
        />
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={true}
            nestedScrollEnabled={true}
          >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Rate Fight</Text>
            <TouchableOpacity
              onPress={closeModal}
              style={styles.closeButton}
            >
              <Text style={[styles.closeText, { color: colors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fightInfo}>
            <View style={styles.fightHeader}>
              <View style={styles.fighterContainer}>
                <Image
                  source={getFighterImage(fight.fighter1.id)}
                  style={styles.fighterImage}
                  resizeMode="cover"
                />
                <Text style={[styles.fighterName, { color: colors.text }]}>
                  {getFighterName(fight.fighter1)}
                </Text>
              </View>

              <View style={styles.vsContainer}>
                <Text style={[styles.vsText, { color: colors.textSecondary }]}>VS</Text>
              </View>

              <View style={styles.fighterContainer}>
                <Image
                  source={getFighterImage(fight.fighter2.id)}
                  style={styles.fighterImage}
                  resizeMode="cover"
                />
                <Text style={[styles.fighterName, { color: colors.text }]}>
                  {getFighterName(fight.fighter2)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.ratingSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Rating</Text>

            {/* Large display star with wheel animation */}
            <View style={styles.displayStarContainer}>
              <View style={styles.animatedStarContainer}>
                <View style={{ position: 'relative' }}>
                  {/* Grey star (base layer) */}
                  <Text style={[styles.displayStar, { color: '#666666' }]}>★</Text>
                  {/* Primary color star (overlay) */}
                  <Animated.View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      opacity: starColorAnimation
                    }}
                  >
                    <Text style={[styles.displayStar, { color: colors.primary }]}>★</Text>
                  </Animated.View>
                </View>
                <View style={styles.wheelContainer}>
                  <Animated.View style={[
                    styles.wheelNumbers,
                    {
                      transform: [{
                        translateY: wheelAnimation.interpolate({
                          inputRange: [0, 1200], // Extended to include blank position at 1200
                          outputRange: [475, -725], // Extended range for blank position
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

                  {/* Smooth top gradient fade - covers top edge completely */}
                  <LinearGradient
                    colors={[colors.background, `${colors.background}DD`, `${colors.background}99`, `${colors.background}44`, 'transparent']}
                    style={[styles.fadeOverlay, { top: 0, height: 38 }]}
                    pointerEvents="none"
                  />

                  {/* Smooth bottom gradient fade - moved down for better centering */}
                  <LinearGradient
                    colors={['transparent', `${colors.background}44`, `${colors.background}99`, `${colors.background}DD`, colors.background, colors.background]}
                    style={[styles.fadeOverlay, { bottom: -8, height: 25 }]}
                    pointerEvents="none"
                  />
                </View>
              </View>
            </View>

            <View style={styles.starContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <TouchableOpacity
                  key={level}
                  onPress={() => handleSetRating(level)}
                  style={styles.starButton}
                >
                  <Text style={[
                    styles.star,
                    { color: level <= rating ? colors.primary : '#666666' }
                  ]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.tagsSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Tags
            </Text>
            <View style={styles.tagsContainer}>
              {availableTags.map((tag) => (
                <TouchableOpacity
                  key={tag.id}
                  onPress={() => toggleTag(tag.id)}
                  style={[
                    styles.tagButton,
                    {
                      backgroundColor: selectedTags.includes(tag.id) ? colors.primary : colors.card,
                      borderColor: colors.border,
                    }
                  ]}
                >
                  <Text style={[
                    styles.tagText,
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

          <View style={styles.commentSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Review</Text>
            <TextInput
              style={[
                styles.commentInput,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text
                }
              ]}
              placeholder="Write comment..."
              placeholderTextColor={colors.textSecondary}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
            />
          </View>


          <View style={styles.saveSection}>
            <TouchableOpacity
              onPress={handleSave}
              style={[
                styles.saveButton,
                { backgroundColor: colors.primary }
              ]}
              disabled={updateUserDataMutation.isPending}
            >
              <Text style={[styles.saveButtonText, { color: colors.textOnAccent }]}>
                {updateUserDataMutation.isPending ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        </View>
      </View>
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    width: '95%',
    maxWidth: 450,
    maxHeight: '90%',
    borderRadius: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  modalContent: {
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 19,
  },
  closeButton: {
    padding: 12,
    margin: -12,
  },
  closeText: {
    fontSize: 20,
    fontWeight: '300',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  fightInfo: {
    marginBottom: 24,
    alignItems: 'center',
  },
  fightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    width: '100%',
  },
  fighterContainer: {
    alignItems: 'center',
    flex: 1,
  },
  fighterImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
    borderWidth: 3,
    borderColor: '#ddd',
  },
  fighterName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  vsContainer: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  vsText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  eventInfo: {
    fontSize: 14,
    textAlign: 'center',
  },
  ratingSection: {
    marginBottom: 20,
    marginTop: -10, // Move up 10px towards fighters area
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  displayStarContainer: {
    alignItems: 'center',
    marginBottom: 4,
    marginTop: -28,
  },
  animatedStarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayStar: {
    fontSize: 80,
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
    paddingTop: 150, // Adjust padding to align numbers correctly
  },
  wheelNumber: {
    fontSize: 52,
    fontWeight: 'bold',
    height: 120,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 120,
    color: 'white',
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
    minWidth: 120,
  },
  fadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 4,
  },
  starButton: {
    padding: 3,
  },
  star: {
    fontSize: 32,
  },
  ratingText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  commentSection: {
    marginBottom: 20,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  tagsSection: {
    marginBottom: 20,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'flex-start',
  },
  tagButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tagHint: {
    fontSize: 12,
    fontWeight: '400',
  },
  tagPrompt: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  saveSection: {
    marginTop: 8,
  },
  saveButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});