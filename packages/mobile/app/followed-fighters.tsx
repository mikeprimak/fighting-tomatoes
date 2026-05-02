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
import { Stack, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';
import FollowFighterButton from '../components/FollowFighterButton';

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
  followerCount?: number;
  startOfFightNotification: boolean;
  dayBeforeNotification: boolean;
}

interface TopFollowedFighter {
  fighter: {
    id: string;
    firstName: string;
    lastName: string;
    profileImage?: string | null;
  };
  followerCount: number;
  isFollowing: boolean;
}

const DEFAULT_FIGHTER_IMAGE = require('../assets/fighters/fighter-default-alpha.png');

const getFighterImageFor = (fighter: { profileImage?: string | null }) => {
  if (fighter.profileImage) {
    return { uri: fighter.profileImage };
  }
  return DEFAULT_FIGHTER_IMAGE;
};

export default function FollowedFightersScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showError, hideAlert } = useCustomAlert();
  const queryClient = useQueryClient();
  const [localUnfollows, setLocalUnfollows] = useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['followedFighters'],
    queryFn: () => apiService.getFollowedFighters(),
  });

  const { data: topFollowedData, refetch: refetchTopFollowed } = useQuery({
    queryKey: ['topFollowedFighters'],
    queryFn: () => apiService.getTopFollowedFighters(20),
  });

  useFocusEffect(
    React.useCallback(() => {
      refetch();
      refetchTopFollowed();
      setLocalUnfollows(new Set());
    }, [refetch, refetchTopFollowed])
  );

  const followMutation = useMutation({
    mutationFn: (fighterId: string) => apiService.followFighter(fighterId),
    onSuccess: () => {
      refetch();
      refetchTopFollowed();
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
      refetchTopFollowed();
      queryClient.invalidateQueries({ queryKey: ['fighters'] });
      queryClient.invalidateQueries({ queryKey: ['fights'] });
    },
    onError: (_err, fighterId) => {
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
      setLocalUnfollows(prev => new Set(prev).add(fighterId));
      unfollowMutation.mutate(fighterId);
    } else {
      setLocalUnfollows(prev => {
        const newSet = new Set(prev);
        newSet.delete(fighterId);
        return newSet;
      });
      followMutation.mutate(fighterId);
    }
  };

  const styles = createStyles(colors);
  const fighters: FollowedFighter[] = data?.fighters || [];
  const followedIdSet = new Set<string>(
    fighters
      .filter((f: FollowedFighter) => !localUnfollows.has(f.id))
      .map((f: FollowedFighter) => f.id)
  );
  const topFollowed: TopFollowedFighter[] = (topFollowedData?.data || []).filter(
    (item: TopFollowedFighter) => !item.isFollowing && !followedIdSet.has(item.fighter.id)
  );

  const renderTopFollowedSection = () => {
    if (topFollowed.length === 0) return null;
    return (
      <View style={styles.topSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Most Followed on Good Fights
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topRow}
        >
          {topFollowed.map((item) => (
            <View key={item.fighter.id} style={styles.topCard}>
              <View style={styles.topImageWrap}>
                <Image source={getFighterImageFor(item.fighter)} style={styles.topImage} />
                <FollowFighterButton
                  fighterId={item.fighter.id}
                  isFollowing={item.isFollowing}
                  style={styles.followBadge}
                  suppressToast
                />
              </View>
              <Text
                style={[styles.topName, { color: colors.text }]}
                numberOfLines={1}
              >
                {item.fighter.firstName} {item.fighter.lastName}
              </Text>
              <Text
                style={[styles.topCount, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {item.followerCount} {item.followerCount === 1 ? 'follower' : 'followers'}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderMyFollowsSection = () => {
    if (isLoading) {
      return (
        <View style={styles.inlineLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    if (error) {
      return (
        <Text style={[styles.errorText, { color: colors.danger }]}>
          Failed to load followed fighters
        </Text>
      );
    }
    if (fighters.length === 0) {
      return (
        <View style={styles.emptyInline}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            You're not following anyone yet.
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Tap the "+" badge above to follow someone, or do it from the hype / rating modals.
          </Text>
        </View>
      );
    }
    return (
      <>
        <Text style={[styles.headerText, { color: colors.textSecondary }]}>
          You will receive a notification before they fight.
        </Text>
        {fighters.map((fighter: FollowedFighter) => {
          const isFollowing = !localUnfollows.has(fighter.id);
          return (
            <View
              key={fighter.id}
              style={[styles.fighterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
            >
              <Image source={getFighterImageFor(fighter)} style={styles.fighterImage} />
              <View style={styles.fighterInfo}>
                <Text style={[styles.fighterName, { color: colors.text }]}>
                  {fighter.firstName} {fighter.lastName}
                </Text>
                {typeof fighter.followerCount === 'number' && (
                  <Text style={[styles.followerCount, { color: colors.textSecondary }]}>
                    {fighter.followerCount} {fighter.followerCount === 1 ? 'follower' : 'followers'}
                  </Text>
                )}
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
      </>
    );
  };

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

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {renderTopFollowedSection()}

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: topFollowed.length > 0 ? 24 : 0 }]}>
          My Followed Fighters
        </Text>
        {renderMyFollowsSection()}
      </ScrollView>

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
    scrollContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    headerText: {
      fontSize: 13,
      marginBottom: 12,
      paddingHorizontal: 4,
    },

    // Top "Most Followed" horizontal scroll
    topSection: {
      marginBottom: 4,
    },
    topRow: {
      paddingHorizontal: 4,
      paddingVertical: 4,
      gap: 14,
    },
    topCard: {
      width: 84,
      alignItems: 'center',
    },
    topImageWrap: {
      width: 64,
      height: 64,
      position: 'relative',
      marginBottom: 6,
    },
    topImage: {
      width: 64,
      height: 64,
      borderRadius: 32,
    },
    followBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
    },
    topName: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    topCount: {
      fontSize: 10,
      textAlign: 'center',
      marginTop: 2,
    },

    // My follows list
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
    followerCount: {
      fontSize: 12,
    },

    // States
    inlineLoading: {
      paddingVertical: 24,
      alignItems: 'center',
    },
    errorText: {
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 16,
    },
    emptyInline: {
      paddingVertical: 16,
      paddingHorizontal: 4,
    },
    emptyText: {
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
    },
    emptySubtext: {
      fontSize: 13,
      lineHeight: 18,
    },
  });
