import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  useColorScheme,
  Animated,
  Easing,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { getFighterImage } from './fight-cards/shared/utils';
import { getHypeHeatmapColor } from '../utils/heatmap';
import { usePredictionAnimation } from '../store/PredictionAnimationContext';

const DEFAULT_FIGHTER_IMAGE = require('../assets/fighters/fighter-default-alpha.png');

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  profileImage?: string | null;
}

interface Fight {
  id: string;
  fighter1: Fighter;
  fighter2: Fighter;
  fighter1Id?: string;
  fighter2Id?: string;
  weightClass?: string | null;
  userRating?: number | null;
  userReview?: { content?: string; rating?: number } | null;
  totalReviews?: number;
  reviewCount?: number;
  event?: any;
}

interface CompletedFightModalProps {
  visible: boolean;
  fight: Fight | null;
  onClose: () => void;
}

// Wheel constants (matching UpcomingFightModal)
const STAR_SLOT_HEIGHT = 115;
const BLANK_POSITION = 1150; // 10 slots * 115

export default function CompletedFightModal({ visible, fight, onClose }: CompletedFightModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { setPendingRatingAnimation } = usePredictionAnimation();

  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [fighter1ImgError, setFighter1ImgError] = useState(false);
  const [fighter2ImgError, setFighter2ImgError] = useState(false);

  // Keyboard visibility
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Comment state
  const [reviewComment, setReviewComment] = useState<string>('');
  const reviewCommentRef = useRef<string>('');
  const initialCommentRef = useRef<string>('');

  // Keep ref in sync with state
  const handleCommentChange = useCallback((text: string) => {
    setReviewComment(text);
    reviewCommentRef.current = text;
  }, []);

  // Fetch fight details to get existing user review
  const { data: fightDetailData } = useQuery({
    queryKey: ['fight', fight?.id],
    queryFn: () => apiService.getFight(fight!.id),
    enabled: !!fight?.id && isAuthenticated && visible,
  });

  // Wheel animation
  const wheelAnimation = useRef(new Animated.Value(BLANK_POSITION)).current;
  const animationTargetRef = useRef<number | null>(null);

  const animateToNumber = useCallback((targetNumber: number) => {
    const targetPosition = targetNumber === 0 ? BLANK_POSITION : (10 - targetNumber) * STAR_SLOT_HEIGHT;
    animationTargetRef.current = targetPosition;

    wheelAnimation.stopAnimation(() => {
      Animated.timing(wheelAnimation, {
        toValue: targetPosition,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished && animationTargetRef.current === targetPosition) {
          wheelAnimation.setValue(targetPosition);
        }
      });
    });
  }, [wheelAnimation]);

  // Reset state when fight changes or modal opens
  const prevFightIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (fight && visible) {
      if (prevFightIdRef.current !== fight.id) {
        prevFightIdRef.current = fight.id;
        const rating = fight.userRating ?? (fight.userReview?.rating ? Number(fight.userReview.rating) : null);
        setSelectedRating(rating);
        setFighter1ImgError(false);
        setFighter2ImgError(false);
        setReviewComment('');
        reviewCommentRef.current = '';
        initialCommentRef.current = '';
        // Set wheel position immediately (no animation on open)
        const pos = rating ? (10 - rating) * STAR_SLOT_HEIGHT : BLANK_POSITION;
        wheelAnimation.setValue(pos);
      }
      // Populate with existing user review once loaded from API
      const fetchedReview = fightDetailData?.fight?.userReview?.content;
      if (fetchedReview) {
        setReviewComment(fetchedReview);
        reviewCommentRef.current = fetchedReview;
        initialCommentRef.current = fetchedReview;
      }
    }
  }, [fight?.id, visible, fightDetailData?.fight?.userReview?.content]);

  // Helper to optimistically update events cache
  const updateEventsCache = useCallback((updates: Record<string, any>) => {
    if (!fight) return;
    // Update all event-related query caches
    const queryKeys = ['upcomingEvents', 'pastEvents', 'liveEvents', 'topFights'];
    queryKeys.forEach(key => {
      queryClient.setQueriesData({ queryKey: [key] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            events: (page.events || []).map((event: any) => ({
              ...event,
              fights: event.fights?.map((f: any) =>
                f.id === fight.id ? { ...f, ...updates } : f
              ) || [],
            })),
            fights: (page.fights || []).map((f: any) =>
              f.id === fight.id ? { ...f, ...updates } : f
            ),
          })),
        };
      });
    });
    // Also update single event queries
    if (fight.event?.id) {
      queryClient.setQueryData(['eventFights', fight.event.id], (old: any) => {
        if (!old?.fights) return old;
        return {
          ...old,
          fights: old.fights.map((f: any) =>
            f.id === fight.id ? { ...f, ...updates } : f
          ),
        };
      });
    }
  }, [fight, queryClient]);

  // Save rating
  const ratingMutation = useMutation({
    mutationFn: ({ fightId, rating, review }: { fightId: string; rating: number | null; review: string | null }) => {
      return apiService.updateFightUserData(fightId, {
        rating,
        review,
      });
    },
    onMutate: async ({ rating }) => {
      updateEventsCache({ userRating: rating });
    },
    onError: () => {
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ['pastEvents'] });
      queryClient.invalidateQueries({ queryKey: ['liveEvents'] });
      queryClient.invalidateQueries({ queryKey: ['topFights'] });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fight', variables.fightId] });
      queryClient.invalidateQueries({ queryKey: ['pastEvents'] });
      queryClient.invalidateQueries({ queryKey: ['liveEvents'] });
      queryClient.invalidateQueries({ queryKey: ['topFights'] });
      setPendingRatingAnimation(variables.fightId);
    },
  });

  const handleDone = useCallback(() => {
    // Save review comment if it changed (use refs to avoid stale closure)
    if (isAuthenticated && fight && selectedRating) {
      const fightId = fight.id;
      const trimmed = reviewCommentRef.current.trim();
      if (trimmed !== initialCommentRef.current || selectedRating !== (fight.userRating ?? null)) {
        ratingMutation.mutate({ fightId, rating: selectedRating, review: trimmed || null });
      }
    }
    onClose();
  }, [isAuthenticated, fight, selectedRating, ratingMutation, onClose]);

  const handleRatingSelection = useCallback((level: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newRating = selectedRating === level ? null : level;
    setSelectedRating(newRating);
    animateToNumber(newRating || 0);
    if (isAuthenticated && fight) {
      ratingMutation.mutate({ fightId: fight.id, rating: newRating, review: reviewCommentRef.current.trim() || null });
    }
  }, [isAuthenticated, fight, selectedRating, animateToNumber, ratingMutation]);

  if (!fight) return null;

  const fighter1Img = fighter1ImgError ? DEFAULT_FIGHTER_IMAGE : getFighterImage(fight.fighter1 as any);
  const fighter2Img = fighter2ImgError ? DEFAULT_FIGHTER_IMAGE : getFighterImage(fight.fighter2 as any);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.kavContainer}
        >
          <TouchableOpacity style={[styles.modalContainer, { backgroundColor: colors.background }]} activeOpacity={1} onPress={() => {}}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              scrollEnabled={keyboardVisible}
              contentContainerStyle={styles.scrollContent}
            >
            {/* Title */}
          <Text style={[styles.mainTitle, { color: colors.text }]}>
            Rate This Fight
          </Text>

          {/* Compact fighter row */}
          <View style={styles.fightersRow}>
            <Image
              source={fighter1Img}
              style={styles.fighterImage}
              onError={() => setFighter1ImgError(true)}
            />
            <View style={styles.fighterNamesBlock}>
              <Text style={[styles.fighterName, { color: colors.text }]} numberOfLines={1}>
                {fight.fighter1.lastName}
              </Text>
              <Text style={[styles.vsText, { color: colors.textSecondary }]}>vs</Text>
              <Text style={[styles.fighterName, { color: colors.text }]} numberOfLines={1}>
                {fight.fighter2.lastName}
              </Text>
            </View>
            <Image
              source={fighter2Img}
              style={styles.fighterImage}
              onError={() => setFighter2ImgError(true)}
            />
          </View>

          {/* Large star wheel display */}
          <View style={styles.starWheelContainer}>
            <View style={styles.starWheelWindow}>
              <Animated.View style={[
                styles.starWheelStrip,
                {
                  transform: [{
                    translateY: wheelAnimation.interpolate({
                      inputRange: [0, BLANK_POSITION],
                      outputRange: [479, -671],
                    })
                  }]
                }
              ]}>
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((number) => {
                  const starColor = getHypeHeatmapColor(number);
                  return (
                    <View key={number} style={styles.starWheelSlot}>
                      <View style={styles.starWheelStar}>
                        <FontAwesome
                          name="star"
                          size={90}
                          color={starColor}
                        />
                        <Text style={styles.starWheelNumber}>{number}</Text>
                      </View>
                    </View>
                  );
                })}
                {/* Grey placeholder star - when no rating selected */}
                <View style={styles.starWheelSlot}>
                  <View style={styles.starWheelStar}>
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

          {/* Row of selectable stars (1-10) */}
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
              const isSelected = level <= (selectedRating || 0);
              const starColor = isSelected ? getHypeHeatmapColor(level) : '#808080';

              return (
                <TouchableOpacity
                  key={level}
                  onPress={() => handleRatingSelection(level)}
                  style={styles.starButton}
                  hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                >
                  <View style={{ width: 28, alignItems: 'center' }}>
                    <FontAwesome
                      name={isSelected ? 'star' : 'star-o'}
                      size={28}
                      color={starColor}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Comment input */}
          {isAuthenticated && (
            <View style={styles.commentSection}>
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
                    selectedRating && selectedRating > 0
                      ? `Why ${selectedRating}/10?`
                      : "What did you think?"
                  }
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  maxLength={1000}
                  value={reviewComment}
                  onChangeText={handleCommentChange}
                />
              </View>
              <TouchableOpacity
                style={styles.seeDetailsLink}
                onPress={() => { const fightId = fight.id; handleDone(); router.push(`/fight/${fightId}` as any); }}
              >
                <Text style={[styles.seeDetailsText, { color: colors.textSecondary }]}>
                  {(() => {
                    const count = fightDetailData?.fight?.totalReviews || fightDetailData?.fight?.reviewCount || fight.totalReviews || fight.reviewCount || 0;
                    return count > 0
                      ? `See ${count} ${count === 1 ? 'Comment' : 'Comments'} >`
                      : 'See Comments >';
                  })()}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Done button */}
          <View style={styles.bottomRow}>
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: colors.primary }]}
              onPress={handleDone}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

            </ScrollView>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kavContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '88%',
    borderRadius: 20,
    maxHeight: '90%',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
  },
  mainTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    opacity: 0.7,
    marginBottom: 16,
  },
  fightersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 12,
  },
  fighterNamesBlock: {
    alignItems: 'center',
    gap: 2,
  },
  fighterImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  fighterName: {
    fontSize: 16,
    fontWeight: '700',
  },
  vsText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  starWheelContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 4,
  },
  starWheelWindow: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    height: STAR_SLOT_HEIGHT,
  },
  starWheelStrip: {
    alignItems: 'center',
    paddingTop: 188,
  },
  starWheelSlot: {
    height: STAR_SLOT_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starWheelStar: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    width: 90,
    height: 105,
  },
  starWheelNumber: {
    position: 'absolute',
    marginTop: 6,
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // Selectable star row
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
    marginTop: 0,
    height: 40,
    alignItems: 'center',
  },
  starButton: {
    paddingVertical: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    paddingHorizontal: 8,
    width: '100%',
  },
  doneButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  commentSection: {
    width: '100%',
    marginTop: 16,
  },
  commentInputContainer: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 10,
  },
  commentInput: {
    fontSize: 15,
    minHeight: 70,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  seeDetailsLink: {
    marginTop: 18,
    alignItems: 'center' as const,
  },
  seeDetailsText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
});
