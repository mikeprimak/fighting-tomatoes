import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { FighterCard } from '../../../components';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  wins: number;
  losses: number;
  draws: number;
  weightClass?: string;
}

interface FightersResponse {
  fighters: Fighter[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function FightersScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useInfiniteQuery({
    queryKey: ['fighters', searchQuery],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await apiService.getFighters({
        page: pageParam,
        limit: 20,
      });
      return response as FightersResponse;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  const allFighters = data?.pages.flatMap(page => page.fighters) || [];
  const totalFighters = data?.pages[0]?.pagination.total || 0;

  const filteredFighters = searchQuery
    ? allFighters.filter(fighter => {
        const fullName = `${fighter.firstName} ${fighter.lastName}`.toLowerCase();
        const nickname = fighter.nickname?.toLowerCase() || '';
        const query = searchQuery.toLowerCase();
        return fullName.includes(query) || nickname.includes(query);
      })
    : allFighters;

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !searchQuery) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, searchQuery]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleFighterPress = (fighter: Fighter) => {
    router.push(`/fighter/${fighter.id}`);
  };

  const renderFighter = ({ item }: { item: Fighter }) => (
    <FighterCard
      fighter={item}
      onPress={handleFighterPress}
    />
  );

  const renderFooter = () => {
    if (!isFetchingNextPage || searchQuery) return null;

    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Loading more fighters...
        </Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <FontAwesome name="user-times" size={48} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          {searchQuery ? 'No fighters found' : 'No fighters available'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          {searchQuery
            ? `No fighters match "${searchQuery}"`
            : 'Check back later for fighter profiles'
          }
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading fighters...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-triangle" size={48} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>
            Error loading fighters
          </Text>
          <TouchableOpacity
            onPress={handleRefresh}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.retryButtonText, { color: colors.textOnAccent }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <FontAwesome name="search" size={16} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search fighters..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <FontAwesome name="times-circle" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Results Info */}
      {searchQuery && (
        <View style={styles.resultsInfo}>
          <Text style={[styles.resultsText, { color: colors.textSecondary }]}>
            {filteredFighters.length} fighter{filteredFighters.length !== 1 ? 's' : ''} found
          </Text>
        </View>
      )}

      {/* Total Count when not searching */}
      {!searchQuery && (
        <View style={styles.resultsInfo}>
          <Text style={[styles.resultsText, { color: colors.textSecondary }]}>
            {totalFighters} total fighters
          </Text>
        </View>
      )}

      {/* Fighters List */}
      <FlatList
        data={filteredFighters}
        renderItem={renderFighter}
        keyExtractor={(item) => item.id}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.listContainer,
          filteredFighters.length === 0 && styles.emptyListContainer
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={10}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  clearButton: {
    padding: 4,
  },
  resultsInfo: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  resultsText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  listContainer: {
    paddingBottom: 20,
  },
  emptyListContainer: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
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
    marginVertical: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  footerLoader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    marginLeft: 8,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});