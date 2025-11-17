import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';

interface FollowedFighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  wins: number;
  losses: number;
  draws: number;
  weightClass?: string;
  profileImage?: string;
  startOfFightNotification: boolean;
  dayBeforeNotification: boolean;
}

export default function FollowedFightersScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();
  const queryClient = useQueryClient();
  const [localUnfollows, setLocalUnfollows] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['followedFighters'],
    queryFn: () => apiService.getFollowedFighters(),
  });

  const followMutation = useMutation({
    mutationFn: (fighterId: string) => apiService.followFighter(fighterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followedFighters'] });
      queryClient.invalidateQueries({ queryKey: ['fighters'] });
      queryClient.invalidateQueries({ queryKey: ['fights'] });
    },
    onError: () => {
      showError('Failed to follow fighter');
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (fighterId: string) => apiService.unfollowFighter(fighterId),
    onSuccess: () => {
      // Invalidate all related queries to ensure data is fresh
      queryClient.invalidateQueries({ queryKey: ['followedFighters'] });
      queryClient.invalidateQueries({ queryKey: ['fighters'] });
      queryClient.invalidateQueries({ queryKey: ['fights'] });
    },
    onError: (error, fighterId) => {
      // Remove from local unfollows on error
      setLocalUnfollows(prev => {
        const newSet = new Set(prev);
        newSet.delete(fighterId);
        return newSet;
      });
      showError('Failed to unfollow fighter');
    },
  });

  const handleToggleFollow = (fighterId: string, isCurrentlyFollowing: boolean) => {
    if (isCurrentlyFollowing) {
      // Toggle OFF - add to local unfollows and call API
      setLocalUnfollows(prev => new Set(prev).add(fighterId));
      unfollowMutation.mutate(fighterId);
    } else {
      // Toggle ON - remove from local unfollows and re-follow
      setLocalUnfollows(prev => {
        const newSet = new Set(prev);
        newSet.delete(fighterId);
        return newSet;
      });
      followMutation.mutate(fighterId);
    }
  };

  const getFighterImage = (fighter: FollowedFighter) => {
    if (fighter.profileImage) {
      return { uri: fighter.profileImage };
    }
    return require('../assets/fighters/fighter-default-alpha.png');
  };

  const styles = createStyles(colors);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Followed Fighters',
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Followed Fighters',
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>
            Failed to load followed fighters
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const fighters = data?.fighters || [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Followed Fighters',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      {fighters.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No fighters with notifications enabled.
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Follow fighters from their profile pages to get notified when they fight!
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={[styles.headerText, { color: colors.textSecondary }]}>
            Fighters you follow. You will receive a notification 15 minutes before they fight.
          </Text>

          {fighters.map((fighter: FollowedFighter) => {
            const isFollowing = !localUnfollows.has(fighter.id);

            return (
              <View
                key={fighter.id}
                style={[styles.fighterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
              >
                <Image
                  source={getFighterImage(fighter)}
                  style={styles.fighterImage}
                />
                <View style={styles.fighterInfo}>
                  <Text style={[styles.fighterName, { color: colors.text }]}>
                    {fighter.firstName} {fighter.lastName}
                  </Text>
                </View>
                <Switch
                  value={isFollowing}
                  onValueChange={() => handleToggleFollow(fighter.id, isFollowing)}
                  trackColor={{ false: colors.textSecondary, true: colors.tint }}
                  thumbColor="#B0B5BA"
                  style={{ transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }}
                  disabled={unfollowMutation.isPending || followMutation.isPending}
                />
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Custom Alert */}
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorText: {
      fontSize: 16,
      textAlign: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      textAlign: 'center',
    },
    scrollContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    headerText: {
      fontSize: 14,
      marginBottom: 16,
      paddingHorizontal: 4,
    },
    fighterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      marginBottom: 8,
      borderBottomWidth: 1,
    },
    fighterImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 12,
    },
    fighterInfo: {
      flex: 1,
    },
    fighterName: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 2,
    },
    fighterNickname: {
      fontSize: 13,
      fontStyle: 'italic',
      marginBottom: 4,
    },
    fighterRecord: {
      fontSize: 13,
    },
  });
