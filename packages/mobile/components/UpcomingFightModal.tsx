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
import { apiService, type FanDNACommittedLine } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { getFighterImage } from './fight-cards/shared/utils';
import { getHypeHeatmapColor } from '../utils/heatmap';
import HypeRevealModal from './HypeRevealModal';

const DEFAULT_FIGHTER_IMAGE = require('../assets/fighters/fighter-default-alpha.png');
const FLAME_HOLLOW = require('../assets/flame-hollow-alpha-thicker-truealpha.png');
const FLAME_HOLLOW_GREY = require('../assets/flame-hollow-alpha-colored.png');

// Community winner-pick bar colors — accent = favored side, muted = underdog.
// Matches the colors used on UpcomingFightCard so the bar reads the same.
const COMMUNITY_BAR_ACCENT = '#4A90D9';
const COMMUNITY_BAR_MUTED = 'rgba(255,255,255,0.15)';

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
  // Winner pick — the falsifiable half of the pre-fight take. Holds the picked
  // fighter's id (fighter1Id / fighter2Id) or null. Co-equal peer to hype; both
  // persist via the same /prediction upsert, so every save sends BOTH values to
  // avoid the upsert nulling the other (backend writes `field || null`).
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
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
  // Community winner-pick bar: anim drives a center-out grow (0 = hidden, 1 =
  // full). previousWinnerRef is the user's pick at open, so the bar's % math
  // can delta the session pick against the already-counted base.
  const winnerBarAnim = useRef(new Animated.Value(0)).current;
  const previousWinnerRef = useRef<string | null>(null);
  // Authoritative post-commit hype stats from the mutation response. Preferred
  // over prefetch+delta in handleDone — the prefetch races with the mutation
  // and can pick up the user's just-saved hype, which makes the delta math
  // double-count (first-hyper would show totalPredictions=2 instead of 1).
  const committedHypeStatsRef = useRef<{
    averageHype: number;
    totalHypePredictions: number;
    hypeDistribution: Record<number, number>;
  } | null>(null);

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
      const existingWinner = fight.userPredictedWinner ?? null;
      setSelectedWinner(existingWinner);
      previousWinnerRef.current = existingWinner;
      // Bar hidden on a fresh open; shown (already grown) if a pick exists.
      winnerBarAnim.setValue(existingWinner ? 1 : 0);
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
      committedHypeStatsRef.current = null;
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

  // Pre-compute the Fan DNA line for every possible hype value while the user
  // is choosing. On Done we look up lines[value-1] and the reveal modal renders
  // instantly without waiting on the commit mutation to come back.
  const { data: peekedDna } = useQuery({
    queryKey: ['fanDNAPeek', 'hype', fight?.id],
    queryFn: () =>
      apiService.getFanDNAPeek({
        action: 'hype',
        surface: 'hype-reveal-modal',
        fightId: fight!.id,
      }),
    enabled: !!fight?.id && isAuthenticated && visible,
    staleTime: 60_000,
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

  // Patch this fight wherever it lives in the query cache so a hype / comment /
  // notify change shows instantly on the exact card the user tapped — the
  // events list, the home rails (topUpcomingFights), a fighter page
  // (fighterFights), an event's fights, or any infinite-scroll page. We deep-walk
  // the active queries and patch any fight-shaped node with a matching id (UUID
  // ids make the shape guard collision-safe), returning the same reference when
  // nothing changed so untouched queries don't re-render.
  const updateEventsCache = useCallback((updates: Record<string, any>) => {
    if (!fight) return;
    const targetId = fight.id;
    const patch = (node: any): any => {
      if (Array.isArray(node)) {
        let changed = false;
        const next = node.map((item) => {
          const r = patch(item);
          if (r !== item) changed = true;
          return r;
        });
        return changed ? next : node;
      }
      if (node && typeof node === 'object') {
        if (
          node.id === targetId &&
          ('userHypePrediction' in node || 'averageHype' in node || 'fighter1' in node)
        ) {
          return { ...node, ...updates };
        }
        let changed = false;
        const next: Record<string, any> = {};
        for (const key of Object.keys(node)) {
          const r = patch(node[key]);
          if (r !== node[key]) changed = true;
          next[key] = r;
        }
        return changed ? next : node;
      }
      return node;
    };
    queryClient.setQueriesData({ type: 'active' }, (old: any) => (old ? patch(old) : old));
  }, [fight, queryClient]);

  // Save the pre-fight take (hype + winner pick). Both inputs persist through
  // the same upsert, so every call sends the FULL current state of both — the
  // backend writes `predictedRating: rating || null` / `predictedWinner: winner
  // || null`, so omitting one would wipe it. Winner method is preserved if set.
  const hypeMutation = useMutation({
    mutationFn: (args: { hypeLevel: number | null; winner: string | null; dnaCommittedLine?: FanDNACommittedLine }) => {
      return apiService.createFightPrediction(fight!.id, {
        predictedRating: args.hypeLevel ?? undefined,
        predictedWinner: args.winner ?? undefined,
        predictedMethod: (fight!.userPredictedMethod as any) || undefined,
        dnaCommittedLine: args.dnaCommittedLine,
      });
    },
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: ['upcomingEvents'] });
      updateEventsCache({ userHypePrediction: args.hypeLevel, userPredictedWinner: args.winner });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['upcomingEvents'] });
    },
    onSuccess: (data, vars) => {
      // Update cache with server-calculated aggregate hype and count
      if (data?.averageHype !== undefined) {
        updateEventsCache({
          averageHype: data.averageHype,
          hypeCount: data.totalHypePredictions,
        });
      }
      // If we pre-peeked, revealDnaLine was set at tap time — leave it.
      // If we didn't (peek hadn't returned), fall back to the server's inline
      // evaluation echoed in fanDNA.
      if (!vars.dnaCommittedLine) {
        const line = data?.fanDNA?.line ?? null;
        setRevealDnaLine(line);
      }
      // Capture server-authoritative hype stats so handleDone can skip the
      // racy prefetch+delta math (see committedHypeStatsRef comment above).
      if (data?.averageHype !== undefined && data?.hypeDistribution) {
        committedHypeStatsRef.current = {
          averageHype: data.averageHype,
          totalHypePredictions: data.totalHypePredictions,
          hypeDistribution: data.hypeDistribution,
        };
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

  const handleDone = useCallback(async (options?: { skipReveal?: boolean }) => {
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
    if (options?.skipReveal) {
      onClose();
      return;
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
      // Prefer server-authoritative stats from the hype mutation response when
      // available. The prefetch races with the mutation — if it lands after,
      // the user's hype is already counted server-side and the delta below
      // double-counts (first-hyper reads as totalPredictions=2 / "about
      // average" instead of 1 / "first to hype").
      const committed = committedHypeStatsRef.current;
      if (committed) {
        setRevealDistribution(committed.hypeDistribution || {});
        setRevealAvgHype(committed.averageHype || 0);
        setRevealTotal(committed.totalHypePredictions || 0);
        setRevealVisible(true);
        return;
      }

      // Two data sources to seed from, in priority order:
      //   1. Prefetched aggregate stats (per-hype distribution available)
      //   2. The fight prop's hypeCount/averageHype (always loaded)
      // Falling back to (2) when prefetch hasn't returned prevents the modal
      // from defaulting to baseTotal=0, which would make a brand-new hype
      // read as totalPredictions=1 and trigger "First to hype this fight"
      // copy on fights that already have plenty of hypes.
      const baseDist = prefetchedStats?.distribution || {};
      const prefetchTotal = prefetchedStats?.totalPredictions;
      const fightTotal = (fight as any)?.hypeCount ?? (fight as any)?.totalHypePredictions ?? 0;
      const fightAvg = (fight as any)?.averageHype ?? 0;
      const baseTotal = prefetchTotal != null ? prefetchTotal : fightTotal;
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

      // If we have a distribution (from prefetch), compute avg from it.
      // Otherwise blend the fight prop's pre-hype average with the new hype.
      let liveAvg: number;
      if (Object.keys(baseDist).length > 0) {
        let sum = 0;
        let count = 0;
        for (let h = 1; h <= 10; h++) {
          const c = liveDist[h] || 0;
          sum += h * c;
          count += c;
        }
        liveAvg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
      } else if (fightTotal > 0 && newHype != null) {
        let weightedSum = fightAvg * fightTotal;
        let denom = fightTotal;
        if (prevHype != null) {
          weightedSum -= prevHype;
        } else {
          denom += 1;
        }
        weightedSum += newHype;
        liveAvg = denom > 0 ? Math.round((weightedSum / denom) * 10) / 10 : 0;
      } else {
        liveAvg = newHype != null ? newHype : 0;
      }

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
    // Pull the pre-peeked DNA line for this value (1-10) and stash it in
    // reveal state immediately. The reveal modal will render it the moment
    // Done is pressed — no network wait, no spinner.
    let preLine: FanDNACommittedLine | null = null;
    if (newHype != null && peekedDna?.lines) {
      preLine = peekedDna.lines[newHype - 1] ?? null;
      setRevealDnaLine(preLine?.line ?? null);
    } else if (newHype == null) {
      setRevealDnaLine(null);
    }
    if (isAuthenticated) {
      // Fire-and-forget — handleDone uses prefetched stats + a local delta to
      // render the reveal instantly, so we don't await the mutation here.
      // Pass the pre-peeked line so the backend records the impression for
      // the exact line we showed. Send the current winner so it isn't wiped.
      hypeMutation.mutate({
        hypeLevel: newHype,
        winner: selectedWinner,
        dnaCommittedLine: preLine ?? undefined,
      });
    }
  }, [isAuthenticated, selectedHype, selectedWinner, animateToNumber, hypeMutation, peekedDna]);

  const handleWinnerSelection = useCallback((fighterId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Toggle: tapping the current pick clears it (a pick is never forced).
    const newWinner = selectedWinner === fighterId ? null : fighterId;
    if (newWinner) {
      // First pick this session → grow the community bar out from the center
      // line. Switching picks keeps it visible (widths update on re-render).
      if (!selectedWinner) {
        winnerBarAnim.setValue(0);
        Animated.timing(winnerBarAnim, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      }
    } else {
      // Cleared the pick → collapse the bar back to the center line.
      Animated.timing(winnerBarAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }).start();
    }
    setSelectedWinner(newWinner);
    if (isAuthenticated) {
      // Persist the take. Send the current hype so the upsert keeps it. No
      // reveal beat for winner this sprint — the hype reveal stays the payoff.
      hypeMutation.mutate({ hypeLevel: selectedHype, winner: newWinner });
    }
  }, [isAuthenticated, selectedHype, selectedWinner, hypeMutation, winnerBarAnim]);

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

  // Community winner split shown under the pick once the user has chosen. Base
  // counts come from the fight payload (falling back to the prefetched stats),
  // adjusted by the user's session pick delta so the % reflects their choice.
  const baseWinner1 = (fight as any).winnerPredictionFighter1 ?? prefetchedStats?.winnerPredictions?.fighter1?.predictions ?? 0;
  const baseWinner2 = (fight as any).winnerPredictionFighter2 ?? prefetchedStats?.winnerPredictions?.fighter2?.predictions ?? 0;
  let winnerCount1 = baseWinner1;
  let winnerCount2 = baseWinner2;
  const prevWinner = previousWinnerRef.current;
  if (prevWinner === fight.fighter1.id) winnerCount1 = Math.max(0, winnerCount1 - 1);
  else if (prevWinner === fight.fighter2.id) winnerCount2 = Math.max(0, winnerCount2 - 1);
  if (selectedWinner === fight.fighter1.id) winnerCount1 += 1;
  else if (selectedWinner === fight.fighter2.id) winnerCount2 += 1;
  const winnerTotal = winnerCount1 + winnerCount2;
  const winner1Pct = winnerTotal > 0 ? Math.round((winnerCount1 / winnerTotal) * 100) : 0;
  const winner2Pct = winnerTotal > 0 ? 100 - winner1Pct : 0;

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
            {/* Title — the matchup */}
          <Text style={[styles.matchupTitle, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {fight.fighter1.lastName} vs {fight.fighter2.lastName}
          </Text>

          {/* Winner pick — co-equal peer to hype. Tap a headshot to crown it. */}
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Your Winner Pick</Text>
          <View style={styles.winnerRow}>
            {([
              { fighter: fight.fighter1, img: fighter1Img, onErr: () => setFighter1ImgError(true) },
              { fighter: fight.fighter2, img: fighter2Img, onErr: () => setFighter2ImgError(true) },
            ] as const).map(({ fighter, img, onErr }) => {
              const isPicked = selectedWinner === fighter.id;
              return (
                <TouchableOpacity
                  key={fighter.id}
                  style={styles.winnerOption}
                  activeOpacity={0.8}
                  onPress={() => handleWinnerSelection(fighter.id)}
                >
                  <View
                    style={[
                      styles.winnerImageWrap,
                      isPicked && { borderColor: colors.primary },
                    ]}
                  >
                    <Image source={img} style={styles.winnerImage} onError={onErr} />
                    {isPicked && (
                      <View style={[styles.pickBadge, { backgroundColor: colors.primary }]}>
                        <FontAwesome6 name="check" size={12} color="#000" />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.winnerName, { color: isPicked ? colors.primary : colors.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {fighter.lastName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Community winner-pick bar — always occupies its slot (so the modal
              height never jumps); contents fade/grow in from the center line
              once a pick is made, with % labels at the far left/right. */}
          <View style={styles.winnerBarRow} pointerEvents="none">
            <Animated.Text
              style={[styles.winnerBarPct, { color: colors.textSecondary, opacity: winnerBarAnim }]}
              numberOfLines={1}
            >
              {winner1Pct}%
            </Animated.Text>
            <View style={styles.winnerBarTrack}>
              <View style={styles.winnerBarHalfLeft}>
                <Animated.View
                  style={{
                    width: winnerBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${winner1Pct}%`] }),
                    height: '100%',
                    borderTopLeftRadius: 5,
                    borderBottomLeftRadius: 5,
                    backgroundColor: winner1Pct >= winner2Pct ? COMMUNITY_BAR_ACCENT : COMMUNITY_BAR_MUTED,
                  }}
                />
              </View>
              <View style={styles.winnerBarHalfRight}>
                <Animated.View
                  style={{
                    width: winnerBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${winner2Pct}%`] }),
                    height: '100%',
                    borderTopRightRadius: 5,
                    borderBottomRightRadius: 5,
                    backgroundColor: winner2Pct > winner1Pct ? COMMUNITY_BAR_ACCENT : COMMUNITY_BAR_MUTED,
                  }}
                />
              </View>
            </View>
            <Animated.Text
              style={[styles.winnerBarPct, { color: colors.textSecondary, opacity: winnerBarAnim }]}
              numberOfLines={1}
            >
              {winner2Pct}%
            </Animated.Text>
          </View>

          {/* Hype — co-equal peer to the winner pick */}
          <Text style={[styles.sectionLabel, styles.hypeLabel, { color: colors.text }]}>How Hyped Are You?</Text>

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

          {/* Comment input box removed for now (display only — wiring retained
              above so it can be restored). The See Comments link stays. */}
          <TouchableOpacity
            style={styles.seeCommentsLink}
            onPress={async () => { const fightId = fight.id; await handleDone({ skipReveal: true }); router.push(`/fight/${fightId}` as any); }}
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
              onPress={() => { handleDone(); }}
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
          // Spinner only when we couldn't pre-peek (no peek data yet) and the
          // mutation is still in flight. With peek loaded this is always false.
          dnaLoading={hypeMutation.isPending && !revealDnaLine && !peekedDna}
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
  matchupTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    opacity: 0.7,
    marginBottom: 12,
    textAlign: 'center',
  },
  hypeLabel: {
    marginTop: 24, // more breathing room above (toward the winner bar)
    marginBottom: 0, // tighter below (toward the flame wheel)
  },
  winnerBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    width: 250,
    marginTop: 6,
    marginBottom: 0,
    gap: 8,
  },
  winnerBarTrack: {
    flex: 1,
    flexDirection: 'row',
    height: 10,
  },
  winnerBarHalfLeft: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end', // fill grows leftward from the center divider
    overflow: 'hidden',
  },
  winnerBarHalfRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start', // fill grows rightward from the center divider
    overflow: 'hidden',
  },
  winnerBarPct: {
    fontSize: 13,
    fontWeight: '700',
    width: 40,
    textAlign: 'center',
  },
  winnerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 28,
  },
  winnerOption: {
    alignItems: 'center',
    gap: 8,
    width: 120,
  },
  winnerImageWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'transparent',
    position: 'relative',
  },
  winnerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  pickBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  winnerName: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
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
    marginTop: 4,
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
