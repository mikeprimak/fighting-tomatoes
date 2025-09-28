import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import { apiService } from '../services/api';
import { useAuth } from '../store/AuthContext';

// Fighter image selection logic (same as other components)
const getFighterImage = (fighterId: string) => {
  const images = [
    require('../assets/fighters/fighter-1.jpg'),
    require('../assets/fighters/fighter-2.jpg'),
    require('../assets/fighters/fighter-3.jpg'),
    require('../assets/fighters/fighter-4.jpg'),
    require('../assets/fighters/fighter-5.jpg'),
    require('../assets/fighters/fighter-6.jpg'),
  ];

  // Use charCodeAt to get a number from the last character
  const lastCharCode = fighterId.charCodeAt(fighterId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export type PredictionMethod = 'DECISION' | 'KO_TKO' | 'SUBMISSION';

export interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
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
  onSuccess?: (isUpdate: boolean) => void;
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
  title = "Pre-Fight Predictions",
  submitButtonText = "Submit Prediction",
  updateButtonText = "Update Prediction",
}: PredictionModalProps) {
  console.log('🔥 PredictionModal RENDER - Fight:', fight?.id, 'Visible:', visible, 'CrewId:', crewId);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

  // Fetch existing predictions for crew-based predictions
  const { data: existingPredictions, isLoading: predictionsLoading, error: predictionsError } = useQuery({
    queryKey: ['crewPredictions', crewId, fight?.id],
    queryFn: async () => {
      if (fight?.id && crewId) {
        console.log('PredictionModal: Fetching predictions for crewId:', crewId, 'fightId:', fight.id);
        const result = await apiService.getCrewPredictions(crewId, fight.id);
        console.log('PredictionModal: Predictions API response:', result);
        return result;
      }
      return null;
    },
    enabled: !!fight?.id && !!crewId && visible,
  });

  // Create prediction mutation for crew-based predictions
  const createPredictionMutation = useMutation({
    mutationFn: (data: PredictionData) => {
      if (!fight?.id || !crewId) throw new Error('Missing fight or crew ID');
      return apiService.createCrewPrediction(crewId, fight.id, data);
    },
    onSuccess: () => {
      if (crewId) {
        queryClient.invalidateQueries({ queryKey: ['crewMessages', crewId] });
        queryClient.invalidateQueries({ queryKey: ['crews'] });
        queryClient.invalidateQueries({ queryKey: ['crewPredictions', crewId, fight?.id] });
      }

      const isUpdate = !!getCurrentUserPrediction();
      const message = isUpdate ? 'Your prediction has been updated!' : 'Your prediction has been recorded!';
      const alertTitle = isUpdate ? 'Prediction Updated' : 'Prediction Submitted';

      Alert.alert(alertTitle, message);
      onSuccess?.(isUpdate);
      onClose();
    },
    onError: (error: any) => {
      Alert.alert('Error', error.error || error.message || 'Failed to submit prediction');
    },
  });

  // Get current user's existing prediction
  const getCurrentUserPrediction = () => {
    if (existingPrediction) return existingPrediction;
    if (existingPredictions?.predictions && user) {
      console.log('PredictionModal: Looking for user prediction. User ID:', user.id);
      console.log('PredictionModal: Available predictions:', existingPredictions.predictions);
      // Backend returns predictions with user.id, not userId
      const userPrediction = existingPredictions.predictions.find((p: any) => p.user?.id === user.id);
      console.log('PredictionModal: Found user prediction:', userPrediction);
      return userPrediction;
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
        }

        const round = userPrediction.predictedRound || 0;
        const method = userPrediction.predictedMethod || '';

        // Validate Decision method with round selection
        if (method === 'DECISION' && round !== fight.scheduledRounds) {
          console.log('PredictionModal: Invalid combination - Decision with non-final round, fixing...');
          // If Decision is selected but round is not final, deselect Decision
          setPredictedMethod('');
          setPredictedRound(round);
        } else {
          setPredictedMethod(method);
          setPredictedRound(round);
        }
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
    // Reset wheel to initial position (no number showing)
    wheelAnimation.setValue(0);
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
    const targetPosition = (10 - targetNumber) * 120;

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
    } else {
      setHypeLevel(level);
      animateToNumber(level);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const handleRoundSelection = (round: number) => {
    if (predictedRound === round) {
      setPredictedRound(0);
      // If round is deselected, also deselect method
      setPredictedMethod('');
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

  // Handle method selection with round logic
  const handleMethodSelection = (method: PredictionMethod) => {
    if (predictedMethod === method) {
      setPredictedMethod('');
    } else {
      setPredictedMethod(method);
      if (!fight) return;

      // If Decision is selected, automatically set round to final round
      if (method === 'DECISION') {
        setPredictedRound(fight.scheduledRounds);
      }
    }
  };

  const handleSubmitPrediction = async () => {
    // Check if at least one field is filled
    const hasAnyPrediction = hypeLevel > 0 || predictedWinner || predictedMethod || predictedRound > 0;

    if (!hasAnyPrediction) {
      Alert.alert('No Prediction', 'Please make at least one prediction before submitting.');
      return;
    }

    if (!fight) {
      Alert.alert('Error', 'No fight selected for prediction.');
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
        const isUpdate = !!getCurrentUserPrediction();
        onSuccess?.(isUpdate);
        onClose();
      } else if (crewId) {
        // Default crew prediction submission
        createPredictionMutation.mutate(predictionData);
      } else {
        throw new Error('No submission method provided');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit prediction');
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity
          style={[styles.predictionContainer, { backgroundColor: colors.card }]}
          activeOpacity={1}
        >
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
                    backgroundColor: predictedWinner === fight.fighter1?.id ? colors.tint : colors.background,
                    borderColor: colors.border,
                  }
                ]}
                onPress={() => {
                  if (!fight.fighter1?.id) return;
                  setPredictedWinner(predictedWinner === fight.fighter1.id ? '' : fight.fighter1.id);
                }}
              >
                <Image
                  source={getFighterImage(fight.fighter1?.id || '')}
                  style={styles.fighterImage}
                />
                <Text style={[
                  styles.fighterButtonText,
                  {
                    color: predictedWinner === fight.fighter1?.id ? 'white' : colors.text
                  }
                ]}>
                  {fight.fighter1?.lastName || 'Fighter 1'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.fighterButton,
                  {
                    backgroundColor: predictedWinner === fight.fighter2?.id ? colors.tint : colors.background,
                    borderColor: colors.border,
                  }
                ]}
                onPress={() => {
                  if (!fight.fighter2?.id) return;
                  setPredictedWinner(predictedWinner === fight.fighter2.id ? '' : fight.fighter2.id);
                }}
              >
                <Image
                  source={getFighterImage(fight.fighter2?.id || '')}
                  style={styles.fighterImage}
                />
                <Text style={[
                  styles.fighterButtonText,
                  {
                    color: predictedWinner === fight.fighter2?.id ? 'white' : colors.text
                  }
                ]}>
                  {fight.fighter2?.lastName || 'Fighter 2'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Predicted Round */}
          <View style={styles.predictionSection}>
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
                      color: predictedRound === round ? 'white' : colors.text
                    }
                  ]}>
                    {round}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Predicted Method */}
          <View style={styles.predictionSection}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              How will it end?
            </Text>
            <View style={styles.methodButtons}>
              {(['KO_TKO', 'SUBMISSION', 'DECISION'] as const).map((method) => {
                // Decision only available for final round
                const isDecisionDisabled = method === 'DECISION' && predictedRound !== fight.scheduledRounds;

                return (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.methodButton,
                      {
                        backgroundColor: predictedMethod === method ? colors.tint : colors.background,
                        borderColor: colors.border,
                        opacity: isDecisionDisabled ? 0.5 : 1,
                      }
                    ]}
                    onPress={() => !isDecisionDisabled && handleMethodSelection(method)}
                    disabled={isDecisionDisabled}
                  >
                    <Text style={[
                      styles.methodButtonText,
                      {
                        color: predictedMethod === method ? 'white' : colors.text
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
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              How hyped are you?
            </Text>

            {/* Large display star with wheel animation */}
            <View style={styles.displayStarContainer}>
              <View style={styles.animatedStarContainer}>
                <Text style={[styles.displayStar, { color: '#666666' }]}>★</Text>
                <View style={styles.wheelContainer}>
                  <Animated.View style={[
                    styles.wheelNumbers,
                    {
                      transform: [{
                        translateY: wheelAnimation.interpolate({
                          inputRange: [0, 1080], // 9 * 120px for positions 0-1080
                          outputRange: [475, -605], // Moved down by 30px
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
                    style={[styles.fadeOverlay, { top: 0, height: 38 }]}
                    pointerEvents="none"
                  />

                  {/* Smooth bottom gradient fade - moved down for better centering */}
                  <LinearGradient
                    colors={['transparent', `${colors.card}44`, `${colors.card}99`, `${colors.card}DD`, colors.card, colors.card]}
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
                  onPress={() => handleHypeLevelSelection(level)}
                  style={styles.starButton}
                >
                  <Text style={[
                    styles.star,
                    { color: level <= hypeLevel ? colors.primary : '#666666' }
                  ]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Submit/Cancel Buttons */}
          <View style={styles.predictionButtons}>
            {(hypeLevel > 0 || predictedWinner || predictedMethod || predictedRound) ? (
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: colors.primary }]}
                onPress={handleSubmitPrediction}
                disabled={isPending}
              >
                <Text style={styles.submitButtonText}>
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
        </TouchableOpacity>
      </TouchableOpacity>
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
  },
  starButton: {
    padding: 3,
  },
  star: {
    fontSize: 32,
  },
  displayStarContainer: {
    alignItems: 'center',
    marginBottom: 16,
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
    height: 120, // Increased from 60 to 120 for more spacing
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 120,
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
    color: 'white',
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