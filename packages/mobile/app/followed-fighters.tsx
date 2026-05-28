import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';
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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['followedFighters'],
    queryFn: () => apiService.getFollowedFighters(),
  });

  const { data: topFollowedData, refetch: refetchTopFollowed } = useQuery({
    queryKey: ['topFollowedFighters'],
    queryFn: () => apiService.getTopFollowedFighters(20),
  });

  // Follow/unfollow is delegated to FollowFighterButton, which invalidates both
  // of these queries on success; a refetch on focus keeps the lists fresh.
  useFocusEffect(
    React.useCallback(() => {
      refetch();
      refetchTopFollowed();
    }, [refetch, refetchTopFollowed])
  );

  const styles = createStyles(colors);
  const fighters: FollowedFighter[] = data?.fighters || [];
  const topFollowed: TopFollowedFighter[] = (topFollowedData?.data || []).filter(
    (item: TopFollowedFighter) => !item.isFollowing
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
                  isFollowing={false}
                  fighterName={`${item.fighter.firstName} ${item.fighter.lastName}`.trim()}
                  suppressToast
                  style={styles.followBadge}
                />
              </View>
              <Text style={[styles.topName, { color: colors.text }]} numberOfLines={1}>
                {item.fighter.firstName} {item.fighter.lastName}
              </Text>
              <Text style={[styles.topCount, { color: colors.textSecondary }]} numberOfLines={1}>
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
            Tap the "+" badge above to follow someone, or do it from a fighter's page or the hype / rating modals.
          </Text>
        </View>
      );
    }
    return (
      <>
        <Text style={[styles.headerText, { color: colors.textSecondary }]}>
          You will receive a notification before they fight.
        </Text>
        {fighters.map((fighter: FollowedFighter) => (
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
            <FollowFighterButton
              fighterId={fighter.id}
              isFollowing={true}
              fighterName={`${fighter.firstName} ${fighter.lastName}`.trim()}
              suppressToast
            />
          </View>
        ))}
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
