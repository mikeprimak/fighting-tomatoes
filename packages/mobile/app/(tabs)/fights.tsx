import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';
import { apiService, type Fight as ApiFight, type ApiError } from '../../services/api';
import { FightDisplayCard, type FightData } from '../../components';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  record?: string;
}

interface Event {
  id: string;
  name: string;
  shortName: string;
  date: string;
  organization: {
    name: string;
    shortName: string;
  };
}

interface Tag {
  id: string;
  name: string;
  category: 'STYLE' | 'PACE' | 'OUTCOME' | 'EMOTION' | 'QUALITY';
}

interface Fight {
  id: string;
  fightOrder: number;
  weightClass?: string;
  isTitle: boolean;
  result?: string;
  winner?: string;
  fighterA: Fighter;
  fighterB: Fighter;
  event: Event;
  averageRating?: number;
  totalRatings?: number;
  userRating?: {
    id: string;
    rating: number;
    comment?: string;
  };
  userReview?: {
    id: string;
    content: string;
    rating: number;
  };
  userTags?: {
    id: string;
    tag: {
      id: string;
      name: string;
      category: string;
    };
  }[];
}


// Predefined tags for quick selection
const AVAILABLE_TAGS: Tag[] = [
  { id: 'brawl', name: 'Brawl', category: 'STYLE' },
  { id: 'technical', name: 'Technical', category: 'STYLE' },
  { id: 'back-and-forth', name: 'Back-and-Forth', category: 'STYLE' },
  { id: 'fast-paced', name: 'Fast-paced', category: 'PACE' },
  { id: 'knockout', name: 'Knockout', category: 'OUTCOME' },
  { id: 'submission', name: 'Submission', category: 'OUTCOME' },
  { id: 'heart', name: 'Heart', category: 'EMOTION' },
  { id: 'brutal', name: 'Brutal', category: 'EMOTION' },
  { id: 'fotn', name: 'FOTN', category: 'QUALITY' },
  { id: 'great-grappling', name: 'Great Grappling', category: 'STYLE' },
];

// Helper function to extract user-specific data from fight response
const extractUserDataFromFight = (fight: any, userId: string): Fight => {
  console.log('Extracting user data for userId:', userId, 'from fight:', {
    fightId: fight.id,
    hasRatings: !!fight.ratings,
    ratingsCount: fight.ratings?.length || 0,
    hasReviews: !!fight.reviews,
    reviewsCount: fight.reviews?.length || 0,
    hasTags: !!fight.tags,
    tagsCount: fight.tags?.length || 0
  });

  const userRating = fight.ratings?.find((r: any) => r.userId === userId);
  const userReview = fight.reviews?.find((r: any) => r.userId === userId);
  const userTags = fight.tags?.filter((t: any) => t.userId === userId);

  console.log('Found user data:', {
    userRating: userRating ? {
      id: userRating.id,
      rating: userRating.rating,
      comment: userRating.comment,
      hasComment: !!userRating.comment,
      rawUserRating: userRating
    } : null,
    userReview: userReview ? {
      id: userReview.id,
      content: userReview.content,
      rating: userReview.rating,
      hasContent: !!userReview.content,
      rawUserReview: userReview
    } : null,
    userTagsCount: userTags?.length || 0
  });

  return {
    ...fight,
    userRating: userRating ? {
      id: userRating.id,
      rating: userRating.rating,
      comment: userRating.comment,
      rawUserRating: userRating, // Include raw data for timestamps
    } : undefined,
    userReview: userReview ? {
      id: userReview.id,
      content: userReview.content,
      rating: userReview.rating,
      rawUserReview: userReview, // Include raw data for timestamps
    } : undefined,
    userTags: userTags?.length > 0 ? userTags : undefined,
  };
};

export default function FightsScreen() {
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showRatingModal, setShowRatingModal] = useState(false);
  
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: fightsData,
    isLoading,
    refetch,
    isRefetching,
    error,
  } = useQuery({
    queryKey: ['fights', user?.id],
    queryFn: () => apiService.getFights({
      limit: 50,
      includeUserData: !!user?.id
    }),
    retry: (failureCount, error) => {
      // Don't retry on authentication errors
      if ((error as any)?.code === 'NO_TOKEN' || (error as any)?.status === 401) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const rateFightMutation = useMutation({
    mutationFn: async ({ fightId, rating, tags }: { fightId: string; rating: number; tags?: string[] }) => {
      // For now, just submit the rating. Tags support can be added later when backend is ready
      return apiService.rateFight(fightId, rating);
    },
    onSuccess: async (data, variables) => {
      console.log('Rating submission SUCCESS:', data);

      // Also submit tags if any are selected
      if (variables.tags && variables.tags.length > 0) {
        try {
          const tagNames = variables.tags.map(tagId => {
            const tag = AVAILABLE_TAGS.find(t => t.id === tagId);
            return tag?.name || tagId;
          });

          console.log('Submitting tags after successful rating:', tagNames);
          await tagFightMutation.mutateAsync({
            fightId: variables.fightId,
            tagNames,
          });
          console.log('Tags submitted successfully');
        } catch (tagError) {
          console.error('Error submitting tags:', tagError);
          // Don't fail the whole operation for tag errors
        }
      }

      queryClient.invalidateQueries({ queryKey: ['fights'] });
      setShowRatingModal(false);
      setRating(0);
      setComment('');
      setSelectedTags([]);
      Alert.alert('Success', data.message);
    },
    onError: (error: ApiError) => {
      let errorMessage = error.error || 'Failed to rate fight';

      if (error.code === 'EMAIL_NOT_VERIFIED') {
        errorMessage = 'Please verify your email address to rate fights';
      } else if (error.code === 'NO_TOKEN') {
        errorMessage = 'Please log in to rate fights';
      } else if (error.code === 'FIGHT_NOT_FOUND') {
        errorMessage = 'This fight could not be found';
      }

      Alert.alert('Error', errorMessage);
    },
  });

  const reviewFightMutation = useMutation({
    mutationFn: async ({ fightId, content, rating, tags, hasExistingReview }: { fightId: string; content: string; rating: number; tags?: string[]; hasExistingReview?: boolean }) => {
      // Use PUT for updating existing reviews, POST for new reviews
      if (hasExistingReview) {
        console.log('Using PUT to update existing review');
        return apiService.updateReview(fightId, { content, rating });
      } else {
        console.log('Using POST to create new review');
        return apiService.reviewFight(fightId, { content, rating });
      }
    },
    onSuccess: async (data, variables) => {
      console.log('Review submission SUCCESS:', data);

      // Also submit tags if any are selected
      if (variables.tags && variables.tags.length > 0) {
        try {
          const tagNames = variables.tags.map(tagId => {
            const tag = AVAILABLE_TAGS.find(t => t.id === tagId);
            return tag?.name || tagId;
          });

          console.log('Submitting tags after successful review:', tagNames);
          await tagFightMutation.mutateAsync({
            fightId: variables.fightId,
            tagNames,
          });
          console.log('Tags submitted successfully');
        } catch (tagError) {
          console.error('Error submitting tags:', tagError);
          // Don't fail the whole operation for tag errors
        }
      }

      queryClient.invalidateQueries({ queryKey: ['fights'] });
      setShowRatingModal(false);
      setRating(0);
      setComment('');
      setSelectedTags([]);
      Alert.alert('Success', data.message);
    },
    onError: (error: ApiError, variables) => {
      console.log('Review submission error - FULL ERROR OBJECT:', {
        error,
        errorCode: error.code,
        errorMessage: error.error,
        errorStatus: (error as any).status,
        variables,
        fullError: JSON.stringify(error, null, 2)
      });


      // Handle other errors normally
      let errorMessage = error.error || 'Failed to submit review';

      if (error.code === 'EMAIL_NOT_VERIFIED') {
        errorMessage = 'Please verify your email address to review fights';
      } else if (error.code === 'NO_TOKEN') {
        errorMessage = 'Please log in to review fights';
      } else if (error.code === 'FIGHT_NOT_FOUND') {
        errorMessage = 'This fight could not be found';
      } else if (error.code === 'VALIDATION_ERROR') {
        errorMessage = 'Validation failed: ' + (error.details ? JSON.stringify(error.details) : 'Please check your input');
      }

      console.log('Showing error alert:', errorMessage);
      Alert.alert('Error', errorMessage);
    },
  });

  const tagFightMutation = useMutation({
    mutationFn: async ({ fightId, tagNames }: { fightId: string; tagNames: string[] }) => {
      return apiService.applyFightTags(fightId, tagNames);
    },
    onSuccess: (data) => {
      console.log('Tag submission SUCCESS:', data);
      // Don't invalidate queries here since this will be called as part of the main submission flow
      // The calling code will handle success actions
    },
    onError: (error: ApiError) => {
      console.error('Tag submission error:', error);
      Alert.alert('Error', error.error || 'Failed to update tags');
    },
  });

  const removeAllDataMutation = useMutation({
    mutationFn: async ({ fightId }: { fightId: string }) => {
      return apiService.removeAllFightData(fightId);
    },
    onSuccess: (data) => {
      console.log('Remove all data SUCCESS:', data);
      queryClient.invalidateQueries({ queryKey: ['fights'] });
      setShowRatingModal(false);
      setRating(0);
      setComment('');
      setSelectedTags([]);
      Alert.alert('Success', 'All your data for this fight has been removed');
    },
    onError: (error: ApiError) => {
      console.error('Remove all data error:', error);
      Alert.alert('Error', error.error || 'Failed to remove data');
    },
  });

  const getFighterName = (fighter: Fighter) => {
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

  const openRatingModal = async (fight: any) => {
    try {
      console.log('Opening rating modal for fight:', fight.id);

      // First, show modal with basic fight data
      setSelectedFight(fight);
      setShowRatingModal(true);

      // If user is logged in, fetch detailed fight data to get user-specific info
      if (user?.id) {
        console.log('Fetching detailed fight data for user prepopulation...');
        const { fight: detailedFight } = await apiService.getFight(fight.id);

        console.log('Received detailed fight data:', {
          fightId: detailedFight.id,
          hasRatings: !!detailedFight.ratings,
          ratingsCount: detailedFight.ratings?.length || 0,
          hasReviews: !!detailedFight.reviews,
          reviewsCount: detailedFight.reviews?.length || 0,
          hasTags: !!detailedFight.tags,
          tagsCount: detailedFight.tags?.length || 0
        });

        // Extract user-specific data from detailed fight
        const enrichedFight = extractUserDataFromFight(detailedFight, user.id);
        setSelectedFight(enrichedFight);

        // Populate existing user data if available
        // Use the most recent rating and any available comment
        const hasUserRating = !!enrichedFight.userRating;
        const hasUserReview = !!enrichedFight.userReview;

        if (hasUserRating || hasUserReview) {
          // Determine which rating to use (prefer more recent one)
          let finalRating = 0;
          let finalComment = '';

          if (hasUserRating && hasUserReview) {
            // Both exist - use the most recent rating by checking raw data timestamps
            const ratingRaw = enrichedFight.userRating.rawUserRating || {};
            const reviewRaw = enrichedFight.userReview.rawUserReview || {};

            const ratingDate = new Date(ratingRaw.updatedAt || ratingRaw.createdAt || 0);
            const reviewDate = new Date(reviewRaw.updatedAt || reviewRaw.createdAt || 0);

            console.log('Comparing timestamps:', {
              ratingDate: ratingDate.toISOString(),
              reviewDate: reviewDate.toISOString(),
              ratingNewer: ratingDate >= reviewDate
            });

            if (ratingDate >= reviewDate) {
              finalRating = enrichedFight.userRating.rating;
              // If rating is more recent, only use comment if rating has one, otherwise clear it
              finalComment = enrichedFight.userRating.comment || '';
              console.log('Using rating from userRating (more recent) - comment from rating only');
            } else {
              finalRating = enrichedFight.userReview.rating;
              // If review is more recent, use review comment
              finalComment = enrichedFight.userReview.content || '';
              console.log('Using rating from userReview (more recent) - comment from review');
            }
          } else if (hasUserReview) {
            // Only review exists
            finalRating = enrichedFight.userReview.rating;
            finalComment = enrichedFight.userReview.content || '';
          } else if (hasUserRating) {
            // Only rating exists
            finalRating = enrichedFight.userRating.rating;
            finalComment = enrichedFight.userRating.comment || '';
          }

          console.log('Prepopulating with combined data:', {
            finalRating,
            finalComment,
            hasUserRating,
            hasUserReview,
            userRatingValue: hasUserRating ? enrichedFight.userRating.rating : null,
            userReviewValue: hasUserReview ? enrichedFight.userReview.rating : null,
            commentSource: hasUserReview ? 'review' : (hasUserRating ? 'rating' : 'none')
          });

          setRating(finalRating);
          setComment(finalComment);
        } else {
          console.log('No existing user data found, starting fresh');
          setRating(0);
          setComment('');
        }

        // Populate existing user tags if available
        if (enrichedFight.userTags && enrichedFight.userTags.length > 0) {
          const existingTagIds = enrichedFight.userTags.map(userTag => {
            // Map backend tag names to our frontend tag IDs
            const tagName = userTag.tag.name.toLowerCase();
            const frontendTag = AVAILABLE_TAGS.find(tag =>
              tag.name.toLowerCase() === tagName ||
              tag.name.toLowerCase().replace(/[^a-z0-9]/g, '-') === tagName.replace(/[^a-z0-9]/g, '-')
            );
            return frontendTag?.id;
          }).filter(Boolean) as string[];

          console.log('Prepopulating tags:', existingTagIds);
          setSelectedTags(existingTagIds);
        } else {
          setSelectedTags([]);
        }
      } else {
        // User not logged in, start fresh
        setRating(0);
        setComment('');
        setSelectedTags([]);
      }
    } catch (error) {
      console.error('Error fetching detailed fight data:', error);
      // If fetch fails, just proceed with basic data
      setRating(0);
      setComment('');
      setSelectedTags([]);
    }
  };

  const submitRating = () => {
    if (!selectedFight) {
      Alert.alert('Error', 'No fight selected');
      return;
    }

    // Check if user is making any changes
    const hasRatingChange = rating > 0;
    const hasCommentChange = comment.trim().length > 0;
    const hasTagChanges = selectedTags.length > 0;

    if (!hasRatingChange && !hasCommentChange && !hasTagChanges) {
      Alert.alert('Error', 'Please make at least one change (rating, review, or tags)');
      return;
    }

    // Check if user has existing data to determine submission strategy
    const hasExistingReview = selectedFight?.userReview;
    const hasExistingRating = selectedFight?.userRating;
    const hasAnyExistingData = hasExistingReview || hasExistingRating;

    console.log('Submission context:', {
      hasExistingReview: !!hasExistingReview,
      hasExistingRating: !!hasExistingRating,
      hasComment: !!comment.trim(),
      commentLength: comment.trim().length
    });

    if (comment.trim()) {
      // User wants to submit a comment - validate length
      if (comment.trim().length < 3) {
        Alert.alert('Error', 'Reviews must be at least 3 characters long');
        return;
      }

      // Always try the review endpoint first (works for new reviews)
      // If it fails with "already exists", the error handler will fall back to rating endpoint
      console.log('ABOUT TO SUBMIT REVIEW - with comment:', {
        fightId: selectedFight.id,
        content: comment.trim(),
        rating,
        contentLength: comment.trim().length,
        isUpdate: hasAnyExistingData,
        hasExistingReview: !!hasExistingReview,
        hasExistingRating: !!hasExistingRating,
        selectedFight: selectedFight
      });

      try {
        console.log('Calling reviewFightMutation.mutate with:', {
          fightId: selectedFight.id,
          content: comment.trim(),
          rating,
          tags: selectedTags,
        });

        reviewFightMutation.mutate({
          fightId: selectedFight.id,
          content: comment.trim(),
          rating,
          tags: selectedTags,
          hasExistingReview: !!hasExistingReview,
        });
        console.log('Review mutation initiated successfully');
      } catch (syncError) {
        console.error('Synchronous error during mutation:', syncError);
        const errorMessage = syncError instanceof Error ? syncError.message : 'Unknown error';
        Alert.alert('Error', 'Failed to submit review: ' + errorMessage);
      }
    } else if (hasRatingChange) {
      // No comment, just submit rating (supports both new and updates)
      console.log('Submitting rating only:', {
        fightId: selectedFight.id,
        rating,
        isUpdate: hasAnyExistingData
      });

      rateFightMutation.mutate({
        fightId: selectedFight.id,
        rating,
        tags: selectedTags,
      });
    } else if (hasTagChanges) {
      // Only tags are being changed, submit tags directly
      console.log('Submitting tags only:', {
        fightId: selectedFight.id,
        tags: selectedTags,
      });

      const tagNames = selectedTags.map(tagId => {
        const tag = AVAILABLE_TAGS.find(t => t.id === tagId);
        return tag?.name || tagId;
      });

      tagFightMutation.mutate({
        fightId: selectedFight.id,
        tagNames,
      }, {
        onSuccess: () => {
          // Handle success for tags-only submission
          queryClient.invalidateQueries({ queryKey: ['fights'] });
          setShowRatingModal(false);
          setRating(0);
          setComment('');
          setSelectedTags([]);
          Alert.alert('Success', 'Tags updated successfully');
        }
      });
    }
  };

  const handleRemoveAllData = () => {
    if (!selectedFight) return;

    Alert.alert(
      'Remove All Data',
      'Are you sure you want to remove your rating, review, and tags for this fight? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            console.log('Removing all data for fight:', selectedFight.id);
            removeAllDataMutation.mutate({ fightId: selectedFight.id });
          },
        },
      ]
    );
  };

  const renderRatingStars = (currentRating: number, onPress?: (rating: number) => void) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onPress?.(star)}
            disabled={!onPress}
            style={styles.starButton}
          >
            <Text style={[
              styles.star,
              { color: star <= currentRating ? colors.primary : colors.textSecondary }
            ]}>
              {star <= currentRating ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const getFighterRecord = (fighter: ApiFight['fighter1']) => {
    return `${fighter.wins}-${fighter.losses}-${fighter.draws}`;
  };

  const renderFightCard = ({ item: fight }: { item: ApiFight }) => (
    <FightDisplayCard
      fight={fight}
      onPress={openRatingModal}
    />
  );

  const styles = createStyles(colors);

  // Handle loading and error states
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading fights...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    const errorMessage = (error as ApiError).code === 'NETWORK_ERROR'
      ? 'Please check your internet connection'
      : 'Failed to load fights';

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.text }]}>
            {errorMessage}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => refetch()}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const fights = fightsData?.fights || [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Rate Fights</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Share your opinion on the best fights
        </Text>
        {fights.length > 0 && (
          <Text style={[styles.fightCount, { color: colors.textSecondary }]}>
            {fightsData?.pagination.total} fights available
          </Text>
        )}
      </View>

      <FlatList
        data={fights}
        keyExtractor={(item) => item.id}
        renderItem={renderFightCard}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Rating Modal */}
      <Modal
        visible={showRatingModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setShowRatingModal(false)}
                style={styles.closeButton}
              >
                <Text style={[styles.closeText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Rate Fight
              </Text>
              <View style={styles.headerButtons}>
                {/* Show remove button only if user has existing data */}
                {(selectedFight?.userRating || selectedFight?.userReview || selectedFight?.userTags?.length > 0) && (
                  <TouchableOpacity
                    onPress={handleRemoveAllData}
                    disabled={removeAllDataMutation.isPending}
                    style={[styles.removeButton, { backgroundColor: colors.destructive || '#ef4444' }]}
                  >
                    <Text style={[styles.removeText, { color: 'white' }]}>
                      {removeAllDataMutation.isPending ? 'Removing...' : 'Remove All'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={submitRating}
                  disabled={rating === 0 || rateFightMutation.isPending || reviewFightMutation.isPending}
                  style={[styles.saveButton, rating === 0 && styles.saveButtonDisabled]}
                >
                  <Text style={[styles.saveText, { color: colors.primary }]}>
                    {(rateFightMutation.isPending || reviewFightMutation.isPending) ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {selectedFight && (
              <>
                <View style={styles.fightInfo}>
                  <Text style={[styles.modalFightTitle, { color: colors.text }]}>
                    {getFighterName(selectedFight.fighterA || selectedFight.fighter1)} vs {getFighterName(selectedFight.fighterB || selectedFight.fighter2)}
                  </Text>
                  <Text style={[styles.modalEventInfo, { color: colors.textSecondary }]}>
                    {selectedFight.event.shortName || selectedFight.event.name} • {formatDate(selectedFight.event.date)}
                  </Text>
                </View>

                <View style={styles.ratingInputSection}>
                  <Text style={[styles.ratingLabel, { color: colors.text }]}>
                    How entertaining was this fight? (1-10)
                  </Text>
                  {renderRatingStars(rating, setRating)}
                  <Text style={[styles.ratingValue, { color: colors.primary }]}>
                    {rating > 0 ? `${rating}/10` : 'Select a rating'}
                  </Text>
                </View>

                <View style={styles.commentSection}>
                  <Text style={[styles.commentLabel, { color: colors.text }]}>
                    Review (Optional)
                  </Text>
                  <TextInput
                    style={[styles.commentInput, {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.text
                    }]}
                    value={comment}
                    onChangeText={setComment}
                    placeholder="Share your thoughts about this fight... (optional)"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                  />
                  <Text style={[styles.characterCount, {
                    color: comment.length > 0 && comment.length < 3 ? colors.danger || '#ef4444' : colors.textSecondary
                  }]}>
                    {comment.length} characters {comment.length > 0 && comment.length < 3 ? '(minimum 3 for reviews)' : ''}
                  </Text>
                </View>

                <View style={styles.tagsSection}>
                  <Text style={[styles.tagsLabel, { color: colors.text }]}>
                    Tags (Optional)
                  </Text>
                  <Text style={[styles.tagsDescription, { color: colors.textSecondary }]}>
                    Select tags that describe this fight
                  </Text>
                  <View style={styles.tagsContainer}>
                    {AVAILABLE_TAGS.map((tag) => (
                      <TouchableOpacity
                        key={tag.id}
                        style={[
                          styles.tagButton,
                          {
                            backgroundColor: selectedTags.includes(tag.id)
                              ? colors.primary
                              : colors.card,
                            borderColor: selectedTags.includes(tag.id)
                              ? colors.primary
                              : colors.border,
                          }
                        ]}
                        onPress={() => {
                          setSelectedTags(prev =>
                            prev.includes(tag.id)
                              ? prev.filter(id => id !== tag.id)
                              : [...prev, tag.id]
                          );
                        }}
                      >
                        <Text style={[
                          styles.tagButtonText,
                          {
                            color: selectedTags.includes(tag.id)
                              ? 'white'
                              : colors.text
                          }
                        ]}>
                          {tag.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {selectedTags.length > 0 && (
                    <Text style={[styles.selectedTagsCount, { color: colors.textSecondary }]}>
                      {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''} selected
                    </Text>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  fightCount: {
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalContent: {
    flexGrow: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  saveButton: {
    padding: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fightInfo: {
    alignItems: 'center',
    marginBottom: 32,
  },
  modalFightTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalEventInfo: {
    fontSize: 14,
  },
  ratingInputSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 16,
  },
  starButton: {
    padding: 4,
  },
  star: {
    fontSize: 24,
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  commentSection: {
    marginBottom: 32,
  },
  commentLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
  },
  characterCount: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  tagsSection: {
    marginBottom: 32,
  },
  tagsLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  tagsDescription: {
    fontSize: 14,
    marginBottom: 16,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  tagButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  tagButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectedTagsCount: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
  },
});