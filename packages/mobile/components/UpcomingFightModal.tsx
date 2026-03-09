import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  useColorScheme,
  Animated,
  Easing,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { getFighterImage } from './fight-cards/shared/utils';
import { getHypeHeatmapColor } from '../utils/heatmap';

const DEFAULT_FIGHTER_IMAGE = require('../assets/fighters/fighter-default-alpha.png');
const FLAME_HOLLOW = require('../assets/flame-hollow-alpha-thicker-truealpha.png');
const FLAME_HOLLOW_GREY = require('../assets/flame-hollow-alpha-colored.png');

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
  userHypePrediction?: number | null;
  userPredictedWinner?: string | null;
  userPredictedMethod?: string | null;
  notificationReasons?: any;
  event?: any;
}

interface UpcomingFightModalProps {
  visible: boolean;
  fight: Fight | null;
  onClose: () => void;
}

// Wheel constants (same as UpcomingFightDetailScreen)
const FLAME_SLOT_HEIGHT = 115;
const BLANK_POSITION = 1150; // 10 slots * 115

export default function UpcomingFightModal({ visible, fight, onClose }: UpcomingFightModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [selectedHype, setSelectedHype] = useState<number | null>(null);
  const [fighter1ImgError, setFighter1ImgError] = useState(false);
  const [fighter2ImgError, setFighter2ImgError] = useState(false);
  const [localNotified, setLocalNotified] = useState(false);
  const notifyScaleAnim = useRef(new Animated.Value(1)).current;

  // Wheel animation
  const wheelAnimation = useRef(new Animated.Value(BLANK_POSITION)).current;
  const animationTargetRef = useRef<number | null>(null);

  const animateToNumber = useCallback((targetNumber: number) => {
    const targetPosition = targetNumber === 0 ? BLANK_POSITION : (10 - targetNumber) * FLAME_SLOT_HEIGHT;
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
  useEffect(() => {
    if (fight && visible) {
      const hype = fight.userHypePrediction ?? null;
      setSelectedHype(hype);
      setFighter1ImgError(false);
      setFighter2ImgError(false);
      const hasNotif = fight.notificationReasons?.reasons?.some(
        (r: any) => r.type === 'manual' && r.isActive
      );
      setLocalNotified(!!hasNotif);
      // Set wheel position immediately (no animation on open)
      const pos = hype ? (10 - hype) * FLAME_SLOT_HEIGHT : BLANK_POSITION;
      wheelAnimation.setValue(pos);
    }
  }, [fight?.id, visible]);

  // Save hype prediction
  const hypeMutation = useMutation({
    mutationFn: (hypeLevel: number | null) => {
      return apiService.createFightPrediction(fight!.id, {
        predictedRating: hypeLevel ?? undefined,
        predictedWinner: fight!.userPredictedWinner || undefined,
        predictedMethod: (fight!.userPredictedMethod as any) || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });
      queryClient.invalidateQueries({ queryKey: ['fight', fight?.id] });
    },
  });

  // Toggle fight notification
  const notifyMutation = useMutation({
    mutationFn: (enabled: boolean) => {
      return apiService.toggleFightNotification(fight!.id, enabled);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });
      queryClient.invalidateQueries({ queryKey: ['fight', fight?.id] });
    },
  });

  const handleHypeSelection = useCallback((level: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newHype = selectedHype === level ? null : level;
    setSelectedHype(newHype);
    animateToNumber(newHype || 0);
    if (isAuthenticated) {
      hypeMutation.mutate(newHype);
    }
  }, [isAuthenticated, selectedHype, animateToNumber, hypeMutation]);

  const handleNotifyPress = useCallback(() => {
    if (!isAuthenticated || !fight) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newValue = !localNotified;
    setLocalNotified(newValue);
    notifyMutation.mutate(newValue);

    // Bounce animation
    Animated.sequence([
      Animated.timing(notifyScaleAnim, {
        toValue: 1.15,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(notifyScaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isAuthenticated, fight, localNotified, notifyMutation, notifyScaleAnim]);

  if (!fight) return null;

  const fighter1Img = fighter1ImgError ? DEFAULT_FIGHTER_IMAGE : getFighterImage(fight.fighter1 as any);
  const fighter2Img = fighter2ImgError ? DEFAULT_FIGHTER_IMAGE : getFighterImage(fight.fighter2 as any);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={[styles.modalContainer, { backgroundColor: colors.background }]} activeOpacity={1} onPress={() => {}}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <FontAwesome name="times" size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Fighter images and names */}
          <View style={styles.fightersRow}>
            {/* Fighter 1 */}
            <View style={styles.fighterColumn}>
              <Image
                source={fighter1Img}
                style={styles.fighterImage}
                onError={() => setFighter1ImgError(true)}
              />
              <Text style={[styles.fighterFirstName, { color: colors.textSecondary }]} numberOfLines={1}>
                {fight.fighter1.firstName}
              </Text>
              <Text style={[styles.fighterLastName, { color: colors.text }]} numberOfLines={1}>
                {fight.fighter1.lastName}
              </Text>
            </View>

            <Text style={[styles.vsText, { color: colors.textSecondary }]}>vs</Text>

            {/* Fighter 2 */}
            <View style={styles.fighterColumn}>
              <Image
                source={fighter2Img}
                style={styles.fighterImage}
                onError={() => setFighter2ImgError(true)}
              />
              <Text style={[styles.fighterFirstName, { color: colors.textSecondary }]} numberOfLines={1}>
                {fight.fighter2.firstName}
              </Text>
              <Text style={[styles.fighterLastName, { color: colors.text }]} numberOfLines={1}>
                {fight.fighter2.lastName}
              </Text>
            </View>
          </View>

          {/* Weight class */}
          {fight.weightClass && (
            <Text style={[styles.weightClass, { color: colors.textSecondary }]}>
              {fight.weightClass}
            </Text>
          )}

          {/* Hype section - matches UpcomingFightDetailScreen */}
          <View style={styles.hypeSection}>
            <Text style={[styles.hypeTitle, { color: colors.textSecondary }]}>
              How hyped are you?
            </Text>

            {/* Large flame wheel display */}
            <View style={styles.flameWheelContainer}>
              <View style={styles.flameWheelWindow}>
                <Animated.View style={[
                  styles.flameWheelStrip,
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
                    const hypeColor = getHypeHeatmapColor(number);
                    return (
                      <View key={number} style={styles.flameWheelSlot}>
                        <View style={styles.flameWheelFlame}>
                          <View style={[styles.flameGlowCircle, { backgroundColor: hypeColor }]} />
                          <FontAwesome6
                            name="fire-flame-curved"
                            size={90}
                            color={hypeColor}
                          />
                          <Text style={styles.flameWheelNumber}>{number}</Text>
                        </View>
                      </View>
                    );
                  })}
                  {/* Grey placeholder flame - when no hype selected */}
                  <View style={styles.flameWheelSlot}>
                    <View style={styles.flameWheelFlame}>
                      <Image
                        source={FLAME_HOLLOW_GREY}
                        style={{ width: 90, height: 90, tintColor: '#666666' }}
                        resizeMode="contain"
                      />
                    </View>
                  </View>
                </Animated.View>
              </View>
            </View>

            {/* Row of selectable flames (1-10) */}
            <View style={styles.flameRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
                const isSelected = level <= (selectedHype || 0);
                const flameColor = isSelected ? getHypeHeatmapColor(level) : '#808080';

                return (
                  <TouchableOpacity
                    key={level}
                    onPress={() => handleHypeSelection(level)}
                    style={styles.flameButton}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <View style={{ width: 28, alignItems: 'center' }}>
                      {isSelected ? (
                        <FontAwesome6
                          name="fire-flame-curved"
                          size={28}
                          color={flameColor}
                        />
                      ) : (
                        <Image
                          source={FLAME_HOLLOW}
                          style={{ width: 28, height: 28 }}
                          resizeMode="contain"
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notify me button */}
          <Animated.View style={{ transform: [{ scale: notifyScaleAnim }] }}>
            <TouchableOpacity
              style={[
                styles.notifyButton,
                {
                  backgroundColor: localNotified ? colors.primary : 'transparent',
                  borderColor: colors.primary,
                },
              ]}
              onPress={handleNotifyPress}
              disabled={notifyMutation.isLoading}
            >
              <FontAwesome
                name={localNotified ? 'bell' : 'bell-o'}
                size={16}
                color={localNotified ? '#000' : colors.primary}
              />
              <Text
                style={[
                  styles.notifyButtonText,
                  { color: localNotified ? '#000' : colors.primary },
                ]}
              >
                {localNotified ? 'Notified' : 'Notify Me'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
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
  modalContainer: {
    width: '90%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    zIndex: 10,
  },
  fightersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  fighterColumn: {
    alignItems: 'center',
    flex: 1,
  },
  fighterImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
  },
  fighterFirstName: {
    fontSize: 13,
    fontWeight: '400',
  },
  fighterLastName: {
    fontSize: 17,
    fontWeight: '700',
  },
  vsText: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 30,
  },
  weightClass: {
    fontSize: 12,
    marginBottom: 16,
  },
  hypeSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  hypeTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  // Large flame wheel (matches UpcomingFightDetailScreen)
  flameWheelContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  flameWheelWindow: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    height: FLAME_SLOT_HEIGHT,
  },
  flameWheelStrip: {
    alignItems: 'center',
    paddingTop: 188,
  },
  flameWheelSlot: {
    height: FLAME_SLOT_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flameWheelFlame: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    width: 90,
    height: 105,
  },
  flameGlowCircle: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    opacity: 0.4,
    top: 30,
  },
  flameWheelNumber: {
    position: 'absolute',
    marginTop: 6,
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // Selectable flame row (matches UpcomingFightDetailScreen)
  flameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: -5,
    height: 38,
    alignItems: 'center',
    width: '100%',
  },
  flameButton: {
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
  },
  notifyButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
