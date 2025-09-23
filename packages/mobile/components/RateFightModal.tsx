import React, { useState, useEffect } from 'react';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { apiService, type ApiError } from '../services/api';
import { useAuth } from '../store/AuthContext';

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
}

const AVAILABLE_TAGS = [
  { id: 'technical', name: 'Technical', category: 'STYLE' },
  { id: 'brawl', name: 'Brawl', category: 'STYLE' },
  { id: 'grappling', name: 'Grappling', category: 'STYLE' },
  { id: 'striking', name: 'Striking', category: 'STYLE' },
  { id: 'fast-paced', name: 'Fast Paced', category: 'PACE' },
  { id: 'slow-paced', name: 'Slow Paced', category: 'PACE' },
  { id: 'back-and-forth', name: 'Back and Forth', category: 'PACE' },
  { id: 'knockout', name: 'Knockout', category: 'OUTCOME' },
  { id: 'submission', name: 'Submission', category: 'OUTCOME' },
  { id: 'decision', name: 'Decision', category: 'OUTCOME' },
  { id: 'upset', name: 'Upset', category: 'OUTCOME' },
  { id: 'exciting', name: 'Exciting', category: 'EMOTION' },
  { id: 'disappointing', name: 'Disappointing', category: 'EMOTION' },
  { id: 'emotional', name: 'Emotional', category: 'EMOTION' },
  { id: 'fight-of-the-night', name: 'Fight of the Night', category: 'QUALITY' },
  { id: 'comeback', name: 'Comeback', category: 'QUALITY' },
];

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

export default function RateFightModal({ visible, fight, onClose, queryKey = ['fights'] }: RateFightModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Reset state when modal opens with new fight
  useEffect(() => {
    if (visible && fight) {
      console.log('RateFightModal: Pre-populating data for fight:', fight.id);
      console.log('Fight data:', {
        hasUserRating: !!fight.userRating,
        hasUserReview: !!fight.userReview,
        hasUserTags: !!fight.userTags,
        userRating: fight.userRating,
        userReview: fight.userReview,
        userTags: fight.userTags
      });

      // Pre-populate with existing data if available
      const hasUserRating = !!fight.userRating;
      const hasUserReview = !!fight.userReview;

      if (hasUserRating || hasUserReview) {
        let finalRating = 0;
        let finalComment = '';

        if (hasUserRating && hasUserReview) {
          // Both exist - prefer review if it has a rating, otherwise use rating
          if (fight.userReview.rating) {
            finalRating = fight.userReview.rating;
            finalComment = fight.userReview.content || '';
            console.log('Using review data (both exist)');
          } else {
            finalRating = fight.userRating.rating || fight.userRating;
            finalComment = fight.userRating.comment || '';
            console.log('Using rating data (both exist, review has no rating)');
          }
        } else if (hasUserReview) {
          finalRating = fight.userReview.rating;
          finalComment = fight.userReview.content || '';
          console.log('Using review data (only review exists)');
        } else if (hasUserRating) {
          // Handle case where userRating might be just a number or an object
          if (typeof fight.userRating === 'number') {
            finalRating = fight.userRating;
            finalComment = '';
          } else {
            finalRating = fight.userRating.rating || 0;
            finalComment = fight.userRating.comment || '';
          }
          console.log('Using rating data (only rating exists)');
        }

        console.log('Pre-populating with:', { finalRating, finalComment });
        setRating(finalRating);
        setComment(finalComment);
      } else {
        console.log('No existing user data, starting fresh');
        setRating(0);
        setComment('');
      }

      // Populate existing user tags if available
      if (fight.userTags && fight.userTags.length > 0) {
        console.log('Processing user tags:', fight.userTags);

        // Handle different possible tag structures
        const existingTagIds = fight.userTags.map(userTag => {
          let tagName = '';

          // Handle different tag structures
          if (typeof userTag === 'string') {
            tagName = userTag.toLowerCase();
          } else if (userTag.tag && userTag.tag.name) {
            tagName = userTag.tag.name.toLowerCase();
          } else if (userTag.name) {
            tagName = userTag.name.toLowerCase();
          }

          const frontendTag = AVAILABLE_TAGS.find(tag =>
            tag.name.toLowerCase() === tagName ||
            tag.id.toLowerCase() === tagName ||
            tag.name.toLowerCase().replace(/[^a-z0-9]/g, '-') === tagName.replace(/[^a-z0-9]/g, '-')
          );

          return frontendTag?.id;
        }).filter(Boolean) as string[];

        console.log('Mapped tag IDs:', existingTagIds);
        setSelectedTags(existingTagIds);
      } else {
        console.log('No existing tags, starting fresh');
        setSelectedTags([]);
      }
    }
  }, [visible, fight]);

  // Mutations
  const rateFightMutation = useMutation({
    mutationFn: ({ fightId, rating }: { fightId: string; rating: number }) => {
      return apiService.rateFight(fightId, rating);
    },
    onSuccess: (data) => {
      console.log('Rate fight SUCCESS:', data);
      queryClient.invalidateQueries({ queryKey });
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
    onSuccess: (data) => {
      console.log('Review fight SUCCESS:', data);
      queryClient.invalidateQueries({ queryKey });
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
                  onPress={() => setRating(star)}
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
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Tags (Optional)</Text>
            <View style={styles.tagsContainer}>
              {AVAILABLE_TAGS.map((tag) => (
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
          </View>

          {/* Remove Data Button */}
          {(fight?.userRating || fight?.userReview || fight?.userTags?.length > 0) && (
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