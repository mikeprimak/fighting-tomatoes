import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import FollowFighterButton from '../components/FollowFighterButton';

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
const PAGE_SIZE = 30;

const getFighterImageFor = (fighter: { profileImage?: string | null }) =>
  fighter.profileImage ? { uri: fighter.profileImage } : DEFAULT_FIGHTER_IMAGE;

export default function MostFollowedFightersScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const styles = createStyles(colors);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    ['mostFollowedFighters'],
    ({ pageParam = 1 }) => apiService.getTopFollowedFighters(PAGE_SIZE, pageParam),
    {
      getNextPageParam: (lastPage, allPages) =>
        lastPage.pagination?.hasMore ? allPages.length + 1 : undefined,
      staleTime: 5 * 60 * 1000,
    }
  );

  const fighters: TopFollowedFighter[] = React.useMemo(
    () => data?.pages?.flatMap((p: any) => p.data) || [],
    [data?.pages]
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item, index }: { item: TopFollowedFighter; index: number }) => (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        onPress={() => router.push(`/fighter/${item.fighter.id}` as any)}
        activeOpacity={0.7}
      >
        <Text style={[styles.rank, { color: colors.textSecondary }]}>{index + 1}</Text>
        <Image source={getFighterImageFor(item.fighter)} style={styles.image} />
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {item.fighter.firstName} {item.fighter.lastName}
          </Text>
          <Text style={[styles.count, { color: colors.textSecondary }]}>
            {item.followerCount} {item.followerCount === 1 ? 'follower' : 'followers'}
          </Text>
        </View>
        <FollowFighterButton
          fighterId={item.fighter.id}
          isFollowing={item.isFollowing}
          fighterName={`${item.fighter.firstName} ${item.fighter.lastName}`.trim()}
          suppressToast
        />
      </TouchableOpacity>
    ),
    [colors, styles]
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Most Followed',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }}
              style={{ paddingVertical: 10, paddingHorizontal: 16, marginLeft: -8 }}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={fighters}
          keyExtractor={(item) => item.fighter.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      padding: 12,
      paddingBottom: 32,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      marginBottom: 8,
      borderBottomWidth: 1,
    },
    rank: {
      width: 28,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
      marginRight: 4,
    },
    image: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 12,
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 2,
    },
    count: {
      fontSize: 12,
    },
  });
