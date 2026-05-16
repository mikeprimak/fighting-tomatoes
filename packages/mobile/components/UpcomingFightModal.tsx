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
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { getFighterImage } from './fight-cards/shared/utils';
import { getHypeHeatmapColor } from '../utils/heatmap';
import FollowFighterButton from './FollowFighterButton';
import HypeRevealModal from './HypeRevealModal';

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
  isFollowingFighter1?: boolean;
  isFollowingFighter2?: boolean;
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

  // Community-reveal modal state. The reveal fires on Done iff the user
  // tapped a hype during this open of the modal — gated by sessionTappedHype.
  // Distribution is prefetched silently when the hype modal opens so the
  // reveal can render instantly on Done (no spinner, no freeze). The user's
  // own vote is folded into the prefetched data via local delta at Done time.
  const [revealVisible, setRevealVisible] = useState(false);
  const [revealDistribution, setRevealDistribution] = useState<Record<number, number>>({});
  const [revealAvgHype, setRevealAvgHype] = useState<number>(0);
  const [revealTotal, setRevealTotal] = useState<number>(0);
  // Fan DNA line returned inline with the hype mutation response. Captured
  // in onSuccess so it's already in state by the time the modal opens.
  const [revealDnaLine, setRevealDnaLine] = useState<string | null>(null);
  const sessionTappedHypeRef = useRef<boolean>(false);
  const sessionLastHypeRef = useRef<number | null>(null);
  // The user's hype value at modal-open time — load-bearing for the delta
  // computation in handleDone (we need to know what to decrement, if any).
  const previousHypeRef = useRef<number | null>(null);

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
  const [preFightComment, setPreFightComment] = useState<string>('');
  const preFightCommentRef = useRef<string>('');

  // Keep ref in sync with state
  const handleCommentChange = useCallback((text: string) => {
    setPreFightComment(text);
    preFightCommentRef.current = text;
  }, []);

  // Fetch existing comment
  const { data: preFightCommentsData } = useQuery({
    queryKey: ['preFightComments', fight?.id],
    queryFn: () => apiService.getFightPreFightComments(fight!.id),
    enabled: !!fight?.id && isAuthenticated && visible,
  });

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
      // Reset session tap tracking — reveal only fires for taps in this open.
      sessionTappedHypeRef.current = false;
      sessionLastHypeRef.current = null;
      // Snapshot what the user had voted before this session so handleDone
      // can decrement the right bucket in the local delta computation.
      previousHypeRef.current = hype;
      // Drop any reveal data captured for a previous fight so the reveal modal
      // never paints stale distribution / avg / total on first frame.
      setRevealDistribution({});
      setRevealAvgHype(0);
      setRevealTotal(0);
      setRevealDnaLine(null);
    }
  }, [fight?.id, visible]);

  // Prefetch the community distribution silently as soon as the hype modal
  // opens. The result isn't displayed here — it's used to render the reveal
  // modal instantly on Done (no awaiting the mutation, no spinner). We pull
  // both authenticated and unauthenticated cases via the same GET endpoint.
  const { data: prefetchedStats } = useQuery({
    queryKey: ['hypeStats', fight?.id],
    queryFn: () => apiService.getFightPredictionStats(fight!.id),
    enabled: !!fight?.id && visible,
    staleTime: 30_000,
  });

  // Populate comment from existing user comment, or reset when modal opens
  const prevFightIdRef = useRef<string | null>(null);
  const initialCommentRef = useRef<string>('');
  useEffect(() => {
    if (fight && visible) {
      // Reset when opening for a new fight
      if (prevFightIdRef.current !== fight.id) {
        prevFightIdRef.current = fight.id;
        setPreFightComment('');
        preFightCommentRef.current = '';
        initialCommentRef.current = '';
      }
      // Populate with existing user comment once loaded
      if (preFightCommentsData?.userComment?.content) {
        setPreFightComment(preFightCommentsData.userComment.content);
        preFightCommentRef.current = preFightCommentsData.userComment.content;
        initialCommentRef.current = preFightCommentsData.userComment.content;
      }
    }
  }, [fight?.id, visible, preFightCommentsData?.userComment?.content]);

  // Save pre-fight comment
  const saveCommentMutation = useMutation({
    mutationFn: ({ fightId, content }: { fightId: string; content: string }) => {
      return apiService.createPreFightComment(fightId, content);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preFightComments', variables.fightId] });
      // Update userCommentCount in events cache so badge updates immediately
      const currentCount = (fight as any)?.userCommentCount ?? 0;
      const newCount = variables.content.trim() === '' ? Math.max(0, currentCount - 1) : currentCount + 1;
      updateEventsCache({ userCommentCount: newCount });
    },
  });

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
      // Update cache with server-calculated aggregate hype and count
      if (data?.averageHype !== undefined) {
        updateEventsCache({
          averageHype: data.averageHype,
          hypeCount: data.totalHypePredictions,
        });
      }
      // Capture the Fan DNA beat that came back with the commit so the reveal
      // modal renders the line in the same frame it opens.
      const line = data?.fanDNA?.line ?? null;
      setRevealDnaLine(line);
      // Note: reveal modal data is computed locally at handleDone time from
      // prefetchedStats + the user's vote delta, so we deliberately do NOT
      // touch reveal state here — avoids late mutations stomping the snapshot.
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

  const handleDone = useCallback(async () => {
    // Save comment if it changed (use refs to avoid stale closure)
    if (isAuthenticated && fight) {
      const fightId = fight.id;
      const trimmed = preFightCommentRef.current.trim();
      if (trimmed !== initialCommentRef.current) {
        try {
          await saveCommentMutation.mutateAsync({ fightId, content: trimmed });
        } catch (e) {
          // Mutation error handled by onError callback
        }
      }
    }
    // If user tapped a hype this session, render the reveal instantly using
    // the prefetched community distribution + a local delta for the user's
    // own vote. This avoids the 1.5s freeze that waiting on the mutation
    // would cause. The mutation still fires in the background to persist.
    // No longer gated on prefetch having returned — if it hasn't, fall back to
    // an empty distribution so first-hyper / race-conditions show the reveal
    // with just the user's own hype instead of silently closing.
    if (
      sessionTappedHypeRef.current &&
      sessionLastHypeRef.current != null
    ) {
      const baseDist = prefetchedStats?.distribution || {};
      const baseTotal = prefetchedStats?.totalPredictions || 0;
      const newHype = sessionLastHypeRef.current;
      const prevHype = previousHypeRef.current;

      // Apply delta: decrement prior bucket if user is editing, increment new.
      const liveDist: Record<number, number> = { ...baseDist };
      let liveTotal = baseTotal;
      if (prevHype != null && prevHype !== newHype) {
        liveDist[prevHype] = Math.max(0, (liveDist[prevHype] || 0) - 1);
      }
      if (prevHype !== newHype) {
        liveDist[newHype] = (liveDist[newHype] || 0) + 1;
        if (prevHype == null) liveTotal += 1;
      }

      // Recompute average from the live distribution.
      let sum = 0;
      let count = 0;
      for (let h = 1; h <= 10; h++) {
        const c = liveDist[h] || 0;
        sum += h * c;
        count += c;
      }
      const liveAvg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

      setRevealDistribution(liveDist);
      setRevealAvgHype(liveAvg);
      setRevealTotal(liveTotal);
      setRevealVisible(true);
      return;
    }
    onClose();
  }, [isAuthenticated, fight, saveCommentMutation, onClose, prefetchedStats]);

  const handleRevealClose = useCallback(() => {
    setRevealVisible(false);
    onClose();
  }, [onClose]);

  const handleHypeSelection = useCallback((level: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newHype = selectedHype === level ? null : level;
    setSelectedHype(newHype);
    animateToNumber(newHype || 0);
    // Track tap for reveal gating. Reveal fires only when there's a non-null
    // hype set this session (deselect-to-null doesn't qualify).
    if (newHype != null) {
      sessionTappedHypeRef.current = true;
      sessionLastHypeRef.current = newHype;
    } else {
      sessionLastHypeRef.current = null;
    }
    if (isAuthenticated) {
      // Fire-and-forget — handleDone uses prefetched stats + a local delta to
      // render the reveal instantly, so we don't await the mutation here.
      hypeMutation.mutate(newHype);
    }
  }, [isAuthenticated, selectedHype, animateToNumber, hypeMutation]);

  const handleNotifyPress = useCallback(() => {
    if (!isAuthenticated || !fight) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newValue = !localNotified;
    setLocalNotified(newValue);
    notifyMutation.mutate(newValue);

    // Show toast message — text branches on whether the event delivers
    // per-fight pings. Reliable-tracker orgs and events the admin has
    // toggled to manual mode both fire on actual walkout; everything else
    // fires ~15 min before section start. Kept short to fit in the 1-line
    // toast slot without growing the modal.
    if (newValue) {
      const perFightPings =
        fight.event?.hasLiveTracking !== false || fight.event?.useManualLiveTracker === true;
      if (perFightPings) {
        setNotifyMessage("Notified when this fight is up next.");
      } else {
        const ct = ((fight as any).cardType as string | null | undefined)?.trim().toLowerCase();
        const section = !ct
          ? 'the card'
          : ct.includes('early prelim')
            ? 'early prelims'
            : ct.includes('prelim')
              ? 'prelims'
              : ct.includes('main')
                ? 'main card'
                : 'the card';
        setNotifyMessage(`Notified ~15 min before ${section}.`);
      }
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
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        {!revealVisible && (
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
            How Hyped Are You?
          </Text>

          {/* Compact fighter row */}
          <View style={styles.fightersRow}>
            <View style={styles.fighterImageWrap}>
              <Image
                source={fighter1Img}
                style={styles.fighterImage}
                onError={() => setFighter1ImgError(true)}
              />
              <FollowFighterButton
                fighterId={fight.fighter1.id}
                isFollowing={fight.isFollowingFighter1 ?? false}
                style={styles.followBadge}
                onFollowed={() => { if (!localNotified) handleNotifyPress(); }}
              />
            </View>
            <View style={styles.fighterNamesBlock}>
              <Text style={[styles.fighterName, { color: colors.text }]} numberOfLines={1}>
                {fight.fighter1.lastName}
              </Text>
              <Text style={[styles.vsText, { color: colors.textSecondary }]}>vs</Text>
              <Text style={[styles.fighterName, { color: colors.text }]} numberOfLines={1}>
                {fight.fighter2.lastName}
              </Text>
            </View>
            <View style={styles.fighterImageWrap}>
              <Image
                source={fighter2Img}
                style={styles.fighterImage}
                onError={() => setFighter2ImgError(true)}
              />
              <FollowFighterButton
                fighterId={fight.fighter2.id}
                isFollowing={fight.isFollowingFighter2 ?? false}
                style={styles.followBadge}
                onFollowed={() => { if (!localNotified) handleNotifyPress(); }}
              />
            </View>
          </View>

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
                    selectedHype && selectedHype > 0
                      ? `Why are you ${selectedHype}/10 hyped?`
                      : "Why are you hyped?"
                  }
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  value={preFightComment}
                  onChangeText={handleCommentChange}
                />
              </View>
              <TouchableOpacity
                style={styles.seeCommentsLink}
                onPress={async () => { const fightId = fight.id; await handleDone(); router.push(`/fight/${fightId}` as any); }}
              >
                <Text style={[styles.seeCommentsText, { color: colors.textSecondary }]}>
                  {(() => {
                    const totalComments = (preFightCommentsData?.comments?.reduce(
                      (acc: number, c: any) => acc + 1 + (c.replies?.length || 0), 0
                    ) || 0);
                    return totalComments > 0
                      ? `See ${totalComments} ${totalComments === 1 ? 'Comment' : 'Comments'} >`
                      : 'See Comments >';
                  })()}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Bottom row: notify bell + done button */}
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
              onPress={handleDone}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Notify toast message — always rendered (with ' ' placeholder)
              to reserve a single line of height. Modal must NOT grow when
              toast appears, so all variants must fit on one line. */}
          <Animated.Text
            style={[styles.notifyToast, { color: colors.textSecondary, opacity: notifyMsgOpacity }]}
            numberOfLines={1}
          >
            {notifyMessage || ' '}
          </Animated.Text>

            </ScrollView>
          </TouchableOpacity>
        </KeyboardAvoidingView>
        )}
        {/* Reveal renders INSIDE the same Modal as the hype content so both
            modalContainers share the exact same parent View. That makes
            their `width: '88%'` resolve to identical pixels. */}
        <HypeRevealModal
          visible={revealVisible}
          onClose={handleRevealClose}
          distribution={revealDistribution}
          totalPredictions={revealTotal}
          averageHype={revealAvgHype}
          userHype={sessionLastHypeRef.current ?? 0}
          dnaLine={revealDnaLine}
          dnaLoading={hypeMutation.isPending && !revealDnaLine}
        />
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
    width: '100%',
  },
  modalContainer: {
    width: '88%',
    borderRadius: 20,
    maxHeight: '90%',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 28,
    paddingBottom: 16,
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
  fighterImageWrap: {
    width: 72,
    height: 72,
    position: 'relative',
  },
  followBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
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
    paddingHorizontal: 16,
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
  seeCommentsLink: {
    marginTop: 18,
    alignItems: 'center' as const,
  },
  seeCommentsText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
});
