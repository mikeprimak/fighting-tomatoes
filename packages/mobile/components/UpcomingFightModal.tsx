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
import { FontAwesome, FontAwesome6, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
  fighter1Odds?: string | null;
  fighter2Odds?: string | null;
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
  showNotificationBell?: boolean;
}

// Wheel constants (same as UpcomingFightDetailScreen)
const FLAME_SLOT_HEIGHT = 115;
const BLANK_POSITION = 1150; // 10 slots * 115

export default function UpcomingFightModal({ visible, fight, onClose, showNotificationBell = false }: UpcomingFightModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [selectedHype, setSelectedHype] = useState<number | null>(null);
  const [fighter1ImgError, setFighter1ImgError] = useState(false);
  const [fighter2ImgError, setFighter2ImgError] = useState(false);
  const [localNotified, setLocalNotified] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
  const notifyScaleAnim = useRef(new Animated.Value(1)).current;
  const notifyMsgOpacity = useRef(new Animated.Value(0)).current;

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

  // Helper to optimistically update events cache
  const updateEventsCache = useCallback((updates: Record<string, any>) => {
    if (!fight) return;
    queryClient.setQueriesData({ queryKey: ['upcomingEvents'] }, (old: any) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          events: page.events.map((event: any) => ({
            ...event,
            fights: event.fights?.map((f: any) =>
              f.id === fight.id ? { ...f, ...updates } : f
            ) || [],
          })),
        })),
      };
    });
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

  // Save hype prediction
  const hypeMutation = useMutation({
    mutationFn: (hypeLevel: number | null) => {
      return apiService.createFightPrediction(fight!.id, {
        predictedRating: hypeLevel ?? undefined,
        predictedWinner: fight!.userPredictedWinner || undefined,
        predictedMethod: (fight!.userPredictedMethod as any) || undefined,
      });
    },
    onMutate: async (hypeLevel) => {
      await queryClient.cancelQueries({ queryKey: ['upcomingEvents'] });
      updateEventsCache({ userHypePrediction: hypeLevel });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });
    },
    onSuccess: (data) => {
      // Update cache with server-calculated aggregate hype
      if (data?.averageHype !== undefined) {
        updateEventsCache({ averageHype: data.averageHype });
      }
      queryClient.invalidateQueries({ queryKey: ['fight', fight?.id] });
    },
  });

  // Toggle fight notification
  const notifyMutation = useMutation({
    mutationFn: (enabled: boolean) => {
      return apiService.toggleFightNotification(fight!.id, enabled);
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: ['upcomingEvents'] });
      // Optimistically update notificationReasons so card bell shows immediately
      updateEventsCache({
        notificationReasons: enabled
          ? { willBeNotified: true, reasons: [{ type: 'manual', source: 'Manual follow', isActive: true }] }
          : { willBeNotified: false, reasons: [] },
      });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });
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

    // Show toast message
    if (newValue) {
      setNotifyMessage("You'll be notified when this fight is up next.");
    } else {
      setNotifyMessage('Notification removed.');
    }
    notifyMsgOpacity.setValue(1);
    Animated.timing(notifyMsgOpacity, {
      toValue: 0,
      duration: 500,
      delay: 2000,
      useNativeDriver: true,
    }).start(() => setNotifyMessage(null));

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
  }, [isAuthenticated, fight, localNotified, notifyMutation, notifyScaleAnim, notifyMsgOpacity]);

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
          {/* Title */}
          <Text style={[styles.mainTitle, { color: colors.text }]}>
            How Hyped Are You?
          </Text>

          {/* Compact fighter row — tappable to go to fight details */}
          <TouchableOpacity
            style={styles.fightersRow}
            activeOpacity={0.7}
            onPress={() => { onClose(); router.push(`/fight/${fight.id}` as any); }}
          >
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
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={styles.fighterRowChevron} />
          </TouchableOpacity>

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
                  hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
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

          {/* Bottom row: notify bell (if live tracking available) + done button */}
          <View style={styles.bottomRow}>
            {showNotificationBell && (
              <Animated.View style={{ transform: [{ scale: notifyScaleAnim }] }}>
                <TouchableOpacity
                  style={[
                    styles.notifyIcon,
                    {
                      backgroundColor: localNotified ? colors.primary : 'transparent',
                      borderColor: localNotified ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={handleNotifyPress}
                  disabled={notifyMutation.isLoading}
                >
                  <FontAwesome
                    name={localNotified ? 'bell' : 'bell-o'}
                    size={18}
                    color={localNotified ? '#000' : colors.textSecondary}
                  />
                </TouchableOpacity>
              </Animated.View>
            )}

            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: colors.primary }]}
              onPress={onClose}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Notify toast message */}
          {notifyMessage && (
            <Animated.Text style={[styles.notifyToast, { color: colors.textSecondary, opacity: notifyMsgOpacity }]}>
              {notifyMessage}
            </Animated.Text>
          )}

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
    width: '88%',
    borderRadius: 20,
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
  flameWheelContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 4,
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
  // Selectable flame row
  flameRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
    marginTop: 0,
    height: 40,
    alignItems: 'center',
  },
  flameButton: {
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
  notifyIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fighterRowChevron: {
    position: 'absolute',
    right: -4,
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
  notifyToast: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 12,
    textAlign: 'center',
  },
});
