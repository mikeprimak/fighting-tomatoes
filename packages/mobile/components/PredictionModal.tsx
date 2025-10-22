import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { apiService } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from './CustomAlert';

// Fighter image selection logic (same as other components)
// Default fallback image when no profileImage is available
const getFighterImage = () => {
  return require('../assets/fighters/fighter-5.jpg');
};

// Get display last name (everything except first word)
const getDisplayLastName = (fighter: Fighter | null | undefined): string => {
  if (!fighter) return '';
  const fullName = `${fighter.firstName} ${fighter.lastName}`.trim();
  const words = fullName.split(' ').filter(w => w.length > 0);

  // If only one word (single name like "Mizuki"), return that word
  if (words.length === 1) {
    return words[0];
  }

  // Return everything except the first word
  return words.slice(1).join(' ') || fighter.lastName || '';
};

export type PredictionMethod = 'DECISION' | 'KO_TKO' | 'SUBMISSION';

export interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  profileImage?: string;
  actionImage?: string;
}

export interface Fight {
  id: string;
  scheduledRounds: number;
  fighter1: Fighter;
  fighter2: Fighter;
  event: {
    id: string;
    name: string;
    date: string;
    promotion: string;
  };
}

export interface PredictionData {
  hypeLevel?: number;
  predictedWinner?: string;
  predictedMethod?: PredictionMethod;
  predictedRound?: number;
}

interface PredictionModalProps {
  visible: boolean;
  onClose: () => void;
  fight: Fight | null;
  crewId?: string;
  onSuccess?: (isUpdate: boolean, data?: { fightId?: string; hypeLevel?: number; winner?: string; method?: string }) => void;
  onSubmit?: (data: PredictionData) => Promise<void>;
  existingPrediction?: PredictionData | null;
  title?: string;
  submitButtonText?: string;
  updateButtonText?: string;
}

export function PredictionModal({
  visible,
  onClose,
  fight,
  crewId,
  onSuccess,
  onSubmit,
  existingPrediction,
  title = "Pre-Fight Prediction",
  submitButtonText = "Submit Prediction",
  updateButtonText = "Update Prediction",
}: PredictionModalProps) {
  console.log('🔥 PredictionModal RENDER v2 - Fight:', fight?.id, 'Visible:', visible, 'Using INDIVIDUAL API only');
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { alertState, showError, hideAlert } = useCustomAlert();

  // Prediction state
  const [hypeLevel, setHypeLevel] = useState(0);
  const [predictedWinner, setPredictedWinner] = useState<string>('');
  const [predictedMethod, setPredictedMethod] = useState<PredictionMethod | ''>('');
  const [predictedRound, setPredictedRound] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animation state for rolling numbers
  const [displayNumber, setDisplayNumber] = useState(0);
  const rollAnimation = useRef(new Animated.Value(1)).current;
  const wheelAnimation = useRef(new Animated.Value(0)).current;
  const flameColorAnimation = useRef(new Animated.Value(0)).current;

  // Fetch existing predictions - ALWAYS use individual FightPrediction (not crew-specific)
  const { data: existingPredictions, isLoading: predictionsLoading, error: predictionsError } = useQuery({
    queryKey: ['fightPrediction', fight?.id],
    queryFn: async () => {
      if (fight?.id) {
        console.log('PredictionModal: Fetching individual prediction for fightId:', fight.id);
        try {
          const result = await apiService.getFightPrediction(fight.id);
          console.log('PredictionModal: Individual prediction API response:', result);
          return result;
        } catch (error: any) {
          // If no prediction exists, that's expected - return null
          if (error.status === 404) {
            console.log('PredictionModal: No individual prediction found (404)');
            return null;
          }
          throw error;
        }
      }
      return null;
    },
    enabled: !!fight?.id && visible,
  });

  // Create prediction mutation - ALWAYS use individual FightPrediction API
  const createPredictionMutation = useMutation({
    mutationFn: (data: PredictionData) => {
      if (!fight?.id) throw new Error('Missing fight ID');

      // Always use individual prediction API - convert PredictionData to API format
      const apiData = {
        predictedRating: data.hypeLevel && data.hypeLevel > 0 ? data.hypeLevel : undefined,
        predictedWinner: data.predictedWinner || undefined,
        predictedMethod: data.predictedMethod || undefined,
        predictedRound: data.predictedRound && data.predictedRound > 0 ? data.predictedRound : undefined,
      };
      console.log('📤 Sending prediction data to API:', apiData);
      return apiService.createFightPrediction(fight.id, apiData);
    },
    onSuccess: () => {
      // Invalidate individual prediction queries
      queryClient.invalidateQueries({ queryKey: ['fightPrediction', fight?.id] });
      queryClient.invalidateQueries({ queryKey: ['fightPredictionStats', fight?.id] });
      queryClient.invalidateQueries({ queryKey: ['fightAggregateStats', fight?.id] });
      queryClient.invalidateQueries({ queryKey: ['fight', fight?.id, 'withUserData'] });

      // If opened from crew context, also invalidate crew queries
      if (crewId) {
        queryClient.invalidateQueries({ queryKey: ['crewMessages', crewId] });
        queryClient.invalidateQueries({ queryKey: ['crews'] });
      }

      const isUpdate = !!getCurrentUserPrediction();

      onSuccess?.(isUpdate, {
        fightId: fight?.id,
        hypeLevel: hypeLevel,
        winner: predictedWinner || undefined,
        method: predictedMethod || undefined
      });
      onClose();
    },
    onError: (error: any) => {
      showError(error.error || error.message || 'Failed to submit prediction', 'Error');
    },
  });

  // Get current user's existing prediction - ALWAYS from individual FightPrediction
  const getCurrentUserPrediction = () => {
    if (existingPrediction) return existingPrediction;

    if (existingPredictions?.prediction) {
      // Individual prediction - the API returns { prediction: { ... } }
      console.log('PredictionModal: Found individual prediction:', existingPredictions.prediction);
      const prediction = existingPredictions.prediction;
      return {
        hypeLevel: prediction.predictedRating,
        predictedWinner: prediction.predictedWinner,
        predictedMethod: prediction.predictedMethod,
        predictedRound: prediction.predictedRound,
      };
    }
    return null;
  };

  // Populate modal with existing prediction data when it opens
  useEffect(() => {
    if (visible && fight && user) {
      const userPrediction = getCurrentUserPrediction();

      console.log('PredictionModal useEffect - Debug data:', {
        visible,
        fightId: fight?.id,
        userId: user?.id,
        existingPredictions: existingPredictions,
        existingPrediction: existingPrediction,
        userPrediction: userPrediction,
        crewId: crewId
      });

      if (userPrediction) {
        console.log('PredictionModal: Populating with existing prediction:', userPrediction);
        // Populate with existing prediction
        const existingHypeLevel = userPrediction.hypeLevel || 0;
        setHypeLevel(existingHypeLevel);
        setPredictedWinner(userPrediction.predictedWinner || '');

        // Initialize wheel to show existing hype level
        if (existingHypeLevel > 0) {
          const wheelPosition = (10 - existingHypeLevel) * 120;
          wheelAnimation.setValue(wheelPosition);
          setDisplayNumber(existingHypeLevel);
          // Set flame color to primary for existing hype level
          flameColorAnimation.setValue(1);
        } else {
          // Set flame color to grey if no hype level
          flameColorAnimation.setValue(0);
        }

        const round = userPrediction.predictedRound || 0;
        const method = userPrediction.predictedMethod || '';

        // No validation needed - all methods are independent of rounds
        setPredictedMethod(method);
        setPredictedRound(round);
      } else {
        console.log('PredictionModal: No existing prediction found, resetting form');
        // Reset to blank state for new predictions
        resetForm();
      }
    } else if (visible) {
      console.log('PredictionModal: Visible but missing fight/user, resetting form');
      // Reset to blank state when no existing predictions
      resetForm();
    }
  }, [visible, existingPredictions, existingPrediction, fight, user]);

  const resetForm = () => {
    setHypeLevel(0);
    setPredictedWinner('');
    setPredictedMethod('');
    setPredictedRound(0);
    setDisplayNumber(0);
    // Reset wheel to blank position (below "1" - position 1200)
    wheelAnimation.setValue(1200);
    // Reset flame color to grey
    flameColorAnimation.setValue(0);
  };

  // Animated wheel effect for number display
  const animateToNumber = (targetNumber: number) => {
    const currentNumber = displayNumber;
    if (currentNumber === targetNumber) return;

    // Stop any existing animation to prevent conflicts
    wheelAnimation.stopAnimation();

    // Calculate target position (positioning number in center of visible area)
    // Numbers are arranged 10,9,8,7,6,5,4,3,2,1 (10 at top, 1 at bottom)
    // Position 0 = number 10, position 120 = number 9, ... position 1080 = number 1
    // Position 1200 = blank (below "1")
    const targetPosition = targetNumber === 0 ? 1200 : (10 - targetNumber) * 120;

    // Simple, smooth animation - prioritizing smoothness over complex behaviors
    Animated.timing(wheelAnimation, {
      toValue: targetPosition,
      duration: 800, // Fixed duration for consistent smoothness
      easing: Easing.out(Easing.quad), // Simple, reliable easing
      useNativeDriver: true,
    }).start();

    // Update display number for tracking
    setDisplayNumber(targetNumber);

    // Removed scale animation to prevent jumpiness in wheel motion
  };

  const handleHypeLevelSelection = (level: number) => {
    if (hypeLevel === level) {
      setHypeLevel(0);
      animateToNumber(0);
      // Animate flame color to grey
      Animated.timing(flameColorAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      setHypeLevel(level);
      animateToNumber(level);
      // Animate flame color to primary color
      Animated.timing(flameColorAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  };

  const handleClose = () => {
    onClose();
  };

  const handleRoundSelection = (round: number) => {
    if (predictedRound === round) {
      setPredictedRound(0);
      // Only deselect method if deselecting final round with Decision
      if (fight && round === fight.scheduledRounds && predictedMethod === 'DECISION') {
        setPredictedMethod('');
      }
    } else {
      setPredictedRound(round);
      if (!fight) return;

      const finalRound = fight.scheduledRounds;
      // If Decision is selected but the new round isn't the final round, deselect method
      if (predictedMethod === 'DECISION' && round !== finalRound) {
        setPredictedMethod(''); // Deselect method
      }
    }
  };

  // Handle method selection (no round logic)
  const handleMethodSelection = (method: PredictionMethod) => {
    if (predictedMethod === method) {
      setPredictedMethod('');
    } else {
      setPredictedMethod(method);
    }
  };

  const handleSubmitPrediction = async () => {
    // Check if at least one field is filled (any prediction is valid)
    const hasAnyPrediction = hypeLevel > 0 || predictedWinner || predictedMethod || predictedRound > 0;
    const currentPrediction = getCurrentUserPrediction();
    const isUpdate = !!currentPrediction;

    // Only show error if trying to create a NEW prediction with no fields
    // Allow clearing all fields if updating an existing prediction
    if (!hasAnyPrediction && !isUpdate) {
      showError('Please make at least one prediction before submitting.', 'No Prediction');
      return;
    }

    if (!fight) {
      showError('No fight selected for prediction.', 'Error');
      return;
    }

    const predictionData: PredictionData = {
      hypeLevel: hypeLevel > 0 ? hypeLevel : undefined,
      predictedWinner: predictedWinner || undefined,
      predictedMethod: predictedMethod || undefined,
      predictedRound: predictedRound > 0 ? predictedRound : undefined,
    };

    try {
      setIsSubmitting(true);

      if (onSubmit) {
        // Custom submit handler
        await onSubmit(predictionData);
        onSuccess?.(isUpdate, {
          fightId: fight?.id,
          hypeLevel: hypeLevel,
          winner: predictedWinner || undefined,
          method: predictedMethod || undefined
        });
        onClose();
      } else {
        // Default prediction submission (crew or individual)
        createPredictionMutation.mutate(predictionData);
      }
    } catch (error: any) {
      showError(error.message || 'Failed to submit prediction', 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!fight) {
    console.log('PredictionModal: fight is null/undefined, not rendering');
    return null;
  }

  if (!fight.fighter1 || !fight.fighter2) {
    console.log('PredictionModal: fighters missing', { fighter1: fight.fighter1, fighter2: fight.fighter2 });
    return null;
  }

  console.log('PredictionModal: rendering with fight', {
    fightId: fight.id,
    fighter1: fight.fighter1?.lastName,
    fighter2: fight.fighter2?.lastName,
    scheduledRounds: fight.scheduledRounds
  });

  const currentPrediction = getCurrentUserPrediction();
  const isUpdate = !!currentPrediction;
  const isPending = createPredictionMutation.isPending || isSubmitting;
  const hasAnyPrediction = hypeLevel > 0 || predictedWinner || predictedMethod || predictedRound > 0;
  const showSubmitButton = hasAnyPrediction || isUpdate;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalOverlayTouchable}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={[styles.predictionContainer, { backgroundColor: colors.card }]}>

          {/* Header */}
          <View style={styles.predictionHeader}>
            <Text style={[styles.predictionTitle, { color: colors.text }]}>
              {title}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <FontAwesome name="times" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Predicted Winner */}
          <View style={styles.predictionSection}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              Who do you think will win?
            </Text>
            <View style={styles.fighterButtons}>
              <TouchableOpacity
                style={[
                  styles.fighterButton,
                  {
                    backgroundColor: predictedWinner === fight.fighter1?.id ? '#83B4F3' : colors.background,
                    borderColor: colors.border,
                  }
                ]}
                onPress={() => {
                  if (!fight.fighter1?.id) return;
                  setPredictedWinner(predictedWinner === fight.fighter1.id ? '' : fight.fighter1.id);
                }}
              >
                <Image
                  source={
                    fight.fighter1?.profileImage && fight.fighter1.profileImage.startsWith('http')
                      ? { uri: fight.fighter1.profileImage }
                      : getFighterImage()
                  }
                  style={styles.fighterImage}
                />
                <Text style={[
                  styles.fighterButtonText,
                  {
                    color: predictedWinner === fight.fighter1?.id ? '#1a1a1a' : colors.text
                  }
                ]}>
                  {getDisplayLastName(fight.fighter1) || 'Fighter 1'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.fighterButton,
                  {
                    backgroundColor: predictedWinner === fight.fighter2?.id ? '#83B4F3' : colors.background,
                    borderColor: colors.border,
                  }
                ]}
                onPress={() => {
                  if (!fight.fighter2?.id) return;
                  setPredictedWinner(predictedWinner === fight.fighter2.id ? '' : fight.fighter2.id);
                }}
              >
                <Image
                  source={
                    fight.fighter2?.profileImage && fight.fighter2.profileImage.startsWith('http')
                      ? { uri: fight.fighter2.profileImage }
                      : getFighterImage()
                  }
                  style={styles.fighterImage}
                />
                <Text style={[
                  styles.fighterButtonText,
                  {
                    color: predictedWinner === fight.fighter2?.id ? '#1a1a1a' : colors.text
                  }
                ]}>
                  {getDisplayLastName(fight.fighter2) || 'Fighter 2'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Predicted Round - HIDDEN */}
          {/* <View style={styles.predictionSection}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              What round will it end in?
            </Text>
            <View style={styles.roundButtons}>
              {Array.from({ length: fight.scheduledRounds }, (_, i) => i + 1).map((round) => (
                <TouchableOpacity
                  key={round}
                  style={[
                    styles.roundButton,
                    {
                      backgroundColor: predictedRound === round ? colors.tint : colors.background,
                      borderColor: colors.border,
                    }
                  ]}
                  onPress={() => handleRoundSelection(round)}
                >
                  <Text style={[
                    styles.roundButtonText,
                    {
                      color: predictedRound === round ? colors.textOnAccent : colors.text
                    }
                  ]}>
                    {round}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View> */}

          {/* Predicted Method */}
          <View style={styles.predictionSection}>
            <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 12 }]}>
              How will it end?
            </Text>
            <View style={styles.methodButtons}>
              {(['KO_TKO', 'SUBMISSION', 'DECISION'] as const).map((method) => {
                return (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.methodButton,
                      {
                        backgroundColor: predictedMethod === method ? '#83B4F3' : colors.background,
                        borderColor: colors.border,
                      }
                    ]}
                    onPress={() => handleMethodSelection(method)}
                  >
                    <Text style={[
                      styles.methodButtonText,
                      {
                        color: predictedMethod === method ? '#1a1a1a' : colors.text
                      }
                    ]}>
                      {method === 'KO_TKO' ? 'KO/TKO' : method}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Hype Level */}
          <View style={styles.predictionSection}>
            <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 12, marginBottom: -3 }]}>
              How hyped are you?
            </Text>

            {/* Large display flame with wheel animation */}
            <View style={styles.displayStarContainer}>
              <View style={styles.animatedStarContainer}>
                <View style={{ position: 'relative' }}>
                  {/* Flame icon changes based on selected hype level */}
                  {(() => {
                    let flameIcon;

                    if (!hypeLevel || hypeLevel === 0) {
                      // No hype selected - grey hollow flame (160px)
                      flameIcon = require('../assets/grey-hollow-160.png');
                    } else if (hypeLevel >= 9) {
                      // High hype (9-10) - blue flame with sparkle (160px)
                      flameIcon = require('../assets/blue-full-sparkle-160.png');
                    } else if (hypeLevel >= 7) {
                      // Medium hype (7-8) - full blue flame (160px)
                      flameIcon = require('../assets/blue-full-160.png');
                    } else {
                      // Low hype (1-6) - hollow blue flame (160px)
                      flameIcon = require('../assets/blue-hollow-160.png');
                    }

                    return (
                      <Image
                        source={flameIcon}
                        style={{ width: 80, height: 80 }}
                        resizeMode="contain"
                      />
                    );
                  })()}
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
                    colors={[colors.card, `${colors.card}DD`, `${colors.card}99`, `${colors.card}44`, 'transparent']}
                    style={[styles.fadeOverlay, { top: -8, height: 38 }]}
                    pointerEvents="none"
                  />

                  {/* Smooth bottom gradient fade - moved down for better centering */}
                  <LinearGradient
                    colors={['transparent', `${colors.card}44`, `${colors.card}99`, `${colors.card}DD`, colors.card, colors.card]}
                    style={[styles.fadeOverlay, { bottom: -6, height: 31 }]}
                    pointerEvents="none"
                  />
                </View>
              </View>
            </View>

            <View style={styles.starContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
                // Simple logic: selected = blue full (no sparkle), unselected = grey hollow
                const isSelected = level <= hypeLevel;
                const flameIcon = isSelected
                  ? require('../assets/blue-full-no-sparkle-160.png')
                  : require('../assets/grey-hollow-160.png');

                return (
                  <TouchableOpacity
                    key={level}
                    onPress={() => handleHypeLevelSelection(level)}
                    style={styles.starButton}
                  >
                    <Image
                      source={flameIcon}
                      style={{ width: 30, height: 30 }}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Submit/Cancel Buttons */}
          <View style={styles.predictionButtons}>
            {showSubmitButton ? (
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: '#83B4F3' }]}
                onPress={handleSubmitPrediction}
                disabled={isPending}
              >
                <Text style={[styles.submitButtonText, { color: '#1a1a1a' }]}>

                  {isPending
                    ? (isUpdate ? 'Updating...' : 'Submitting...')
                    : (isUpdate ? updateButtonText : submitButtonText)}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: colors.border }]}
                onPress={handleClose}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
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
  predictionContainer: {
    width: '95%',
    maxWidth: 450,
    maxHeight: '90%',
    padding: 20,
    borderRadius: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  predictionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 12,
    margin: -12,
  },
  predictionSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 1,
  },
  starButton: {
    padding: 1,
  },
  star: {
    fontSize: 32,
  },
  displayStarContainer: {
    alignItems: 'center',
    marginBottom: 1,
    paddingTop: 10,
    paddingBottom: 10,
  },
  animatedStarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
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
    height: 120, // Increased from 60 to 120 for more spacing
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 120,
    color: 'white',
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
    minWidth: 120, // Set minimum width to prevent squishing
  },
  fadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  fighterButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  fighterButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  fighterImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
  },
  fighterButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  roundButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roundButton: {
    flex: 1,
    minWidth: 50,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roundButtonText: {
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
  predictionButtons: {
    marginTop: 8,
  },
  submitButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});