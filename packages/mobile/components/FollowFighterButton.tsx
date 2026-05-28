import React, { useState, useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ViewStyle,
  Animated,
  Text,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { ensurePushPermissionAfterAction } from '../services/notificationService';
import { useAuth } from '../store/AuthContext';
import { useVerification } from '../store/VerificationContext';

interface FollowFighterButtonProps {
  fighterId: string;
  isFollowing: boolean;
  fighterName?: string;
  style?: ViewStyle;
  onFollowed?: () => void;
  suppressToast?: boolean;
  // 'condensed' = icon-only badge (cards, rows, image corners — default).
  // 'large' = labeled pill ("+ Follow" / "✓ Following") for prominent spots like fighter pages.
  variant?: 'condensed' | 'large';
}

const SIZE = 22;
const ICON_SIZE = 11;

export default function FollowFighterButton({ fighterId, isFollowing, fighterName, style, onFollowed, suppressToast, variant = 'condensed' }: FollowFighterButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const { requireVerification } = useVerification();
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = useState<boolean>(isFollowing);
  const [showToast, setShowToast] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  // Tracks the user's last intent so a stale parent refetch can't overwrite it.
  // null = no pending intent; sync the prop freely.
  const intentRef = useRef<boolean | null>(null);
  const lastFighterIdRef = useRef(fighterId);

  useEffect(() => {
    // Always reset when the rendered fighter changes.
    if (lastFighterIdRef.current !== fighterId) {
      lastFighterIdRef.current = fighterId;
      intentRef.current = null;
      setOptimistic(isFollowing);
      return;
    }
    // Only adopt the prop once it agrees with our intent (or we have none).
    if (intentRef.current === null || intentRef.current === isFollowing) {
      intentRef.current = null;
      setOptimistic(isFollowing);
    }
  }, [isFollowing, fighterId]);

  const mutation = useMutation({
    mutationFn: async (currentlyFollowing: boolean) => {
      if (currentlyFollowing) {
        return await apiService.unfollowFighter(fighterId);
      }
      return await apiService.followFighter(fighterId);
    },
    onMutate: (currentlyFollowing) => {
      const willFollow = !currentlyFollowing;
      intentRef.current = willFollow;
      setOptimistic(willFollow);
      if (willFollow) {
        if (!suppressToast) {
          setShowToast(true);
          toastOpacity.setValue(1);
          Animated.timing(toastOpacity, {
            toValue: 0,
            duration: 500,
            delay: 2500,
            useNativeDriver: true,
          }).start(() => setShowToast(false));
        }
        onFollowed?.();
      }
    },
    onError: (_err, currentlyFollowing) => {
      intentRef.current = null;
      setOptimistic(currentlyFollowing);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fighter', fighterId] });
      queryClient.invalidateQueries({ queryKey: ['fight'] });
      queryClient.invalidateQueries({ queryKey: ['fights'] });
      queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
      queryClient.invalidateQueries({ queryKey: ['eventFights'] });
      queryClient.invalidateQueries({ queryKey: ['topUpcomingFights'] });
      queryClient.invalidateQueries({ queryKey: ['followedFighters'] });
      queryClient.invalidateQueries({ queryKey: ['topFollowedFighters'] });
      if (data?.isFollowing) {
        ensurePushPermissionAfterAction({
          context: 'fighter-follow',
          subject: fighterName,
        }).catch(() => {});
      }
    },
  });

  const handlePress = () => {
    if (!isAuthenticated) return;
    if (!requireVerification('follow this fighter')) return;
    // Use the latest intent if a mutation is mid-flight, otherwise the displayed state.
    const current = intentRef.current ?? optimistic;
    mutation.mutate(current);
  };

  if (!isAuthenticated) return null;

  const following = optimistic;
  const isLarge = variant === 'large';
  // Following is always solid primary fill. Not-following is an outline:
  // condensed stays muted (subtle affordance in dense lists), large reads as a
  // primary CTA.
  const bg = following ? colors.primary : colors.background;
  const borderColor = following ? colors.primary : (isLarge ? colors.primary : colors.textSecondary);
  const fg = following ? '#1a1a1a' : (isLarge ? colors.primary : colors.textSecondary);

  if (isLarge) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[styles.pill, { backgroundColor: bg, borderColor }, style]}
      >
        <FontAwesome name={following ? 'check' : 'plus'} size={13} color={fg} />
        <Text style={[styles.pillText, { color: fg }]}>
          {following ? 'Following' : 'Follow'}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        style={[
          styles.badge,
          { backgroundColor: bg, borderColor },
          style,
        ]}
      >
        <FontAwesome name={following ? 'check' : 'plus'} size={ICON_SIZE} color={fg} />
      </TouchableOpacity>
      {showToast && (
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.toast,
            { color: colors.textSecondary, opacity: toastOpacity },
          ]}
        >
          Following
        </Animated.Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    top: '100%',
    left: -25,
    right: -25,
    marginTop: 6,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
});
