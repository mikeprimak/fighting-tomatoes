import React, { useState, useEffect } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { useVerification } from '../store/VerificationContext';

interface FollowFighterButtonProps {
  fighterId: string;
  isFollowing: boolean;
  style?: ViewStyle;
}

export default function FollowFighterButton({ fighterId, isFollowing, style }: FollowFighterButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const { requireVerification } = useVerification();
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = useState<boolean>(isFollowing);

  useEffect(() => {
    setOptimistic(isFollowing);
  }, [isFollowing, fighterId]);

  const mutation = useMutation({
    mutationFn: async (currentlyFollowing: boolean) => {
      if (currentlyFollowing) {
        return await apiService.unfollowFighter(fighterId);
      }
      return await apiService.followFighter(fighterId);
    },
    onMutate: (currentlyFollowing) => {
      setOptimistic(!currentlyFollowing);
    },
    onError: (_err, currentlyFollowing) => {
      setOptimistic(currentlyFollowing);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fighter', fighterId] });
      queryClient.invalidateQueries({ queryKey: ['fight'] });
      queryClient.invalidateQueries({ queryKey: ['fights'] });
      queryClient.invalidateQueries({ queryKey: ['followedFighters'] });
    },
  });

  const handlePress = () => {
    if (!isAuthenticated) return;
    if (!requireVerification('follow this fighter')) return;
    mutation.mutate(optimistic);
  };

  if (!isAuthenticated) return null;

  const following = optimistic;
  const fg = following ? '#1a1a1a' : colors.primary;
  const bg = following ? colors.primary : 'transparent';

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={mutation.isPending}
      activeOpacity={0.7}
      style={[
        styles.button,
        { backgroundColor: bg, borderColor: colors.primary },
        style,
      ]}
    >
      {mutation.isPending ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          <FontAwesome name={following ? 'bell' : 'bell-o'} size={12} color={fg} />
          <Text style={[styles.buttonText, { color: fg }]}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 88,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
