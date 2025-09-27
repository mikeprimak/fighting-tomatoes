import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { apiService, type ApiError } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { AnalyticsService } from '../services/analytics';

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
  onSuccess?: (type: 'rating' | 'review' | 'tags' | 'remove') => void;
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
const shuffleArray = <T>(array: T[]): T[] => {
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

  // Determine how many random tags to show (8-10 total, minus already selected)
  const minTags = 8;
  const maxTags = 10;
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
  const finalTags = [...mustIncludeTags, ...randomlySelectedTags];

  return finalTags;
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

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagRandomSeed, setTagRandomSeed] = useState(0); // Trigger for re-randomizing tags

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  // Custom setRating function that triggers tag re-randomization
  const handleSetRating = (newRating: number) => {
    setRating(newRating);
    // Trigger tag re-randomization when rating changes
    setTagRandomSeed(prev => prev + 1);
  };

  // Reset state when modal opens with new fight
  useEffect(() => {
    if (visible && fight) {
      console.log('🎯 RateFightModal useEffect: Pre-populating data for fight:', fight.id);

      // Reset random seed for fresh tag selection
      setTagRandomSeed(Math.floor(Math.random() * 1000));

      // Use fetched fight data with user info if available, otherwise fallback to passed fight data
      const fightData = fightWithUserData?.fight || fight;
      console.log('🎯 RateFightModal: Fight data source:', {
        hasApiData: !!fightWithUserData?.fight,
        hasUserRating: !!fightData.userRating,
        hasUserReview: !!fightData.userReview,
        hasUserTags: !!fightData.userTags,
        userRating: fightData.userRating,
        userReview: fightData.userReview,
        userTags: fightData.userTags
      });

      // Pre-populate with existing data if available
      const hasUserRating = !!fightData.userRating;
      const hasUserReview = !!fightData.userReview;

      if (hasUserRating || hasUserReview) {
        let finalRating = 0;
        let finalComment = '';

        if (hasUserRating && hasUserReview) {
          // Both exist - prefer review if it has a rating, otherwise use rating
          if (fightData.userReview.rating) {
            finalRating = fightData.userReview.rating;
            finalComment = fightData.userReview.content || '';
            console.log('🎯 Using review data (both exist)');
          } else {
            finalRating = fightData.userRating.rating || fightData.userRating;
            finalComment = fightData.userRating.comment || '';
            console.log('🎯 Using rating data (both exist, review has no rating)');
          }
        } else if (hasUserReview) {
          finalRating = fightData.userReview.rating;
          finalComment = fightData.userReview.content || '';
          console.log('🎯 Using review data (only review exists)');
        } else if (hasUserRating) {
          // Handle case where userRating might be just a number or an object
          if (typeof fightData.userRating === 'number') {
            finalRating = fightData.userRating;
            finalComment = '';
          } else {
            finalRating = fightData.userRating.rating || 0;
            finalComment = fightData.userRating.comment || '';
          }
          console.log('🎯 Using rating data (only rating exists)');
        }

        console.log('🎯 Pre-populating with:', { finalRating, finalComment });
        setRating(finalRating);
        setComment(finalComment);
      } else {
        console.log('🎯 No existing user data, starting fresh');
        setRating(0);
        setComment('');
      }

      // Populate existing user tags if available
      if (fightData.userTags && fightData.userTags.length > 0) {
        console.log('🎯 Processing user tags:', fightData.userTags);

        // Handle different possible tag structures
        const existingTagIds = fightData.userTags.map(userTag => {
          let tagName = '';

          // Handle different tag structures
          if (typeof userTag === 'string') {
            tagName = userTag.toLowerCase();
          } else if (userTag.tag && userTag.tag.name) {
            tagName = userTag.tag.name.toLowerCase();
          } else if (userTag.name) {
            tagName = userTag.name.toLowerCase();
          }

          const frontendTag = ALL_FIGHT_TAGS.find(tag =>
            tag.name.toLowerCase() === tagName ||
            tag.id.toLowerCase() === tagName ||
            tag.name.toLowerCase().replace(/[^a-z0-9]/g, '-') === tagName.replace(/[^a-z0-9]/g, '-')
          );

          return frontendTag?.id;
        }).filter(Boolean) as string[];

        console.log('🎯 Mapped tag IDs:', existingTagIds);
        setSelectedTags(existingTagIds);
      } else {
        console.log('🎯 No existing tags, starting fresh');
        setSelectedTags([]);
      }
    }
  }, [visible, fight, fightWithUserData]);

  // Mutations
  const rateFightMutation = useMutation({
    mutationFn: ({ fightId, rating }: { fightId: string; rating: number }) => {
      return apiService.rateFight(fightId, rating);
    },
    onSuccess: async (data) => {
      console.log('Rate fight SUCCESS:', data);

      // Track analytics
      if (fight) {
        await AnalyticsService.trackFightRating(fight.id, rating);

        // Check if this is user's first rating
        const existingRating = fight.userRating;
        if (!existingRating) {
          await AnalyticsService.trackFirstRating();
        }
      }

      // Send crew message with original format if crewId is provided
      if (crewId && fight) {
        try {
          const fighter1LastName = fight.fighter1.lastName;
          const fighter2LastName = fight.fighter2.lastName;
          const message = `Rated ${fighter1LastName} vs ${fighter2LastName} ${rating}/10 ⭐`;

          console.log('Sending crew message:', message);
          await apiService.sendCrewMessage(crewId, {
            content: message,
            fightId: fight.id
          });
        } catch (error) {
          console.error('Failed to send crew message:', error);
          // Don't fail the entire operation if crew message fails
        }
      }

      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['fight', fight?.id, 'withUserData'] });
      onSuccess?.('rating');
      closeModal();
      Alert.alert('Success', 'Rating saved successfully!');
    },
    onError: (error: ApiError) => {
      console.error('Rate fight ERROR:', error);
      Alert.alert('Error', error.error || 'Failed to save rating');
    },
  });

  const reviewFightMutation = useMutation({
    mutationFn: ({ fightId, data }: { fightId: string; data: any }) => {
      return apiService.reviewFight(fightId, data);
    },
    onSuccess: async (data) => {
      console.log('Review fight SUCCESS:', data);

      // Track analytics
      if (fight) {
        await AnalyticsService.trackReviewPosted(fight.id, comment.length);

        // Check if this is user's first review
        const existingReview = fight.userReview;
        if (!existingReview) {
          await AnalyticsService.trackFirstReview();
        }
      }

      // Send crew message with original format if crewId is provided
      if (crewId && fight) {
        try {
          const fighter1LastName = fight.fighter1.lastName;
          const fighter2LastName = fight.fighter2.lastName;
          const message = `Rated ${fighter1LastName} vs ${fighter2LastName} ${rating}/10 ⭐`;

          console.log('Sending crew message (from review):', message);
          await apiService.sendCrewMessage(crewId, {
            content: message,
            fightId: fight.id
          });
        } catch (error) {
          console.error('Failed to send crew message (from review):', error);
          // Don't fail the entire operation if crew message fails
        }
      }

      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['fight', fight?.id, 'withUserData'] });
      onSuccess?.('review');
      closeModal();
      Alert.alert('Success', 'Review saved successfully!');
    },
    onError: (error: ApiError) => {
      console.error('Review fight ERROR:', error);
      Alert.alert('Error', error.error || 'Failed to save review');
    },
  });

  const tagFightMutation = useMutation({
    mutationFn: ({ fightId, tagNames }: { fightId: string; tagNames: string[] }) => {
      return apiService.applyFightTags(fightId, tagNames);
    },
    onSuccess: (data) => {
      console.log('Tag fight SUCCESS:', data);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['fight', fight?.id, 'withUserData'] });
      onSuccess?.('tags');
      closeModal();
      Alert.alert('Success', 'Tags applied successfully!');
    },
    onError: (error: ApiError) => {
      console.error('Tag fight ERROR:', error);
      Alert.alert('Error', error.error || 'Failed to apply tags');
    },
  });

  const removeAllDataMutation = useMutation({
    mutationFn: ({ fightId }: { fightId: string }) => {
      return apiService.removeAllFightData(fightId);
    },
    onSuccess: (data) => {
      console.log('Remove all data SUCCESS:', data);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['fight', fight?.id, 'withUserData'] });
      onSuccess?.('remove');
      closeModal();
      Alert.alert('Success', 'All data removed successfully!');
    },
    onError: (error: ApiError) => {
      console.error('Remove all data ERROR:', error);
      Alert.alert('Error', error.error || 'Failed to remove data');
    },
  });

  const closeModal = () => {
    setRating(0);
    setComment('');
    setSelectedTags([]);
    setTagRandomSeed(0);
    onClose();
  };

  const submitRating = () => {
    if (!fight) {
      Alert.alert('Error', 'No fight selected');
      return;
    }

    if (rating === 0) {
      Alert.alert('Error', 'Please select a rating');
      return;
    }

    // Validate comment length if comment exists
    if (comment.trim() && comment.trim().length < 3) {
      Alert.alert('Error', 'Comments must be at least 3 characters long');
      return;
    }

    if (comment.trim() && selectedTags.length > 0) {
      // Submit as review with tags
      reviewFightMutation.mutate({
        fightId: fight.id,
        data: {
          content: comment.trim(),
          rating: rating,
        }
      });

      // Apply tags separately
      tagFightMutation.mutate({
        fightId: fight.id,
        tagNames: selectedTags,
      });
    } else if (comment.trim()) {
      // Submit as review only
      reviewFightMutation.mutate({
        fightId: fight.id,
        data: {
          content: comment.trim(),
          rating: rating,
        }
      });
    } else if (selectedTags.length > 0) {
      // Submit rating and apply tags
      rateFightMutation.mutate({
        fightId: fight.id,
        rating: rating,
      });

      tagFightMutation.mutate({
        fightId: fight.id,
        tagNames: selectedTags,
      });
    } else {
      // Submit rating only
      rateFightMutation.mutate({
        fightId: fight.id,
        rating: rating,
      });
    }
  };

  const handleRemoveAllData = () => {
    if (!fight) return;

    Alert.alert(
      'Remove All Data',
      'This will remove your rating, review, and tags for this fight. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            console.log('Removing all data for fight:', fight.id);
            removeAllDataMutation.mutate({ fightId: fight.id });
          }
        }
      ]
    );
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const getFighterName = (fighter: any) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
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
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeModal}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={closeModal}
              style={styles.closeButton}
            >
              <Text style={[styles.closeText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Rate Fight</Text>
            <View style={styles.placeholder} />
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

            <Text style={[styles.eventInfo, { color: colors.textSecondary }]}>
              {fight.event.name} • {formatDate(fight.event.date)}
            </Text>
          </View>

          <View style={styles.ratingSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Rating</Text>
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleSetRating(star)}
                  style={styles.starButton}
                >
                  <Text style={[
                    styles.star,
                    { color: star <= rating ? colors.primary : colors.textSecondary }
                  ]}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.ratingText, { color: colors.textSecondary }]}>
              {rating}/10 {rating > 0 && (rating <= 3 ? 'Poor' : rating <= 5 ? 'Fair' : rating <= 7 ? 'Good' : rating <= 9 ? 'Great' : 'Excellent')}
            </Text>
          </View>

          <View style={styles.commentSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Review (Optional)</Text>
            <TextInput
              style={[
                styles.commentInput,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text
                }
              ]}
              placeholder="Share your thoughts about this fight..."
              placeholderTextColor={colors.textSecondary}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.tagsSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Tags (Optional)
              {rating > 0 && (
                <Text style={[styles.tagHint, { color: colors.textSecondary }]}>
                  {' '}• Tags adapt to your rating
                </Text>
              )}
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
                      color: selectedTags.includes(tag.id) ? 'white' : colors.text
                    }
                  ]}>
                    {tag.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {rating === 0 && (
              <Text style={[styles.tagPrompt, { color: colors.textSecondary }]}>
                Select a rating to see relevant tags
              </Text>
            )}
          </View>

          {/* Remove Data Button */}
          {(() => {
            const fightData = fightWithUserData?.fight || fight;
            return (fightData?.userRating || fightData?.userReview || fightData?.userTags?.length > 0);
          })() && (
            <View style={styles.removeSection}>
              <TouchableOpacity
                onPress={handleRemoveAllData}
                style={[styles.removeButton, { borderColor: colors.danger }]}
              >
                <Text style={[styles.removeButtonText, { color: colors.danger }]}>
                  Remove All My Data for This Fight
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.saveSection}>
            <TouchableOpacity
              onPress={submitRating}
              style={[
                styles.saveButton,
                { backgroundColor: rating > 0 ? colors.primary : colors.textSecondary }
              ]}
              disabled={rating === 0 || rateFightMutation.isPending || reviewFightMutation.isPending}
            >
              <Text style={styles.saveButtonText}>
                {(rateFightMutation.isPending || reviewFightMutation.isPending) ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  modalContent: {
    flexGrow: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 60,
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
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  starButton: {
    padding: 4,
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
    marginBottom: 24,
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
    marginBottom: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
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
  removeSection: {
    marginBottom: 24,
  },
  removeButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  saveSection: {
    marginTop: 'auto',
  },
  saveButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});