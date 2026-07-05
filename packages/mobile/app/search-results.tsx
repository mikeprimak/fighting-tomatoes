import React, { useLayoutEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import UpcomingFightCard from '../components/fight-cards/UpcomingFightCard';
import CompletedFightCard from '../components/fight-cards/CompletedFightCard';
import FighterCard from '../components/FighterCard';
import SmallEventCard from '../components/SmallEventCard';
import { getFighterImageUrl } from '../components/fight-cards/shared/utils';

const DEFAULT_FIGHTER_IMAGE = require('../assets/fighters/fighter-default-alpha.png');

// Weight classes are stored as uppercase enums (e.g. LIGHT_HEAVYWEIGHT)
const formatWeightClass = (wc?: string | null): string => {
  if (!wc) return '';
  return wc
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Search Results Screen
 * Displays search results across fighters, fights, events, and promotions
 */
export default function SearchResultsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { q } = useLocalSearchParams<{ q: string }>();

  // Set the navigation header title to show the search query
  useLayoutEffect(() => {
    if (q) {
      navigation.setOptions({
        title: `Search Results - "${q}"`,
      });
    }
  }, [q, navigation]);

  // Invalidate search results when screen comes into focus (e.g., after updating a fight prediction)
  useFocusEffect(
    React.useCallback(() => {
      if (q && q.length >= 2) {
        queryClient.invalidateQueries({ queryKey: ['search', q] });
      }
    }, [q, queryClient])
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', q],
    queryFn: () => apiService.search(q || '', 10),
    enabled: !!q && q.length >= 2,
    refetchOnMount: 'always', // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: 20,
    },
    header: {
      padding: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    queryText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    section: {
      marginTop: 16,
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
    },
    resultCount: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    promotionCardContainer: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    promotionImageContainer: {
      width: '33%',
      aspectRatio: 1,
      backgroundColor: colors.border,
    },
    promotionImage: {
      width: '100%',
      height: '100%',
    },
    promotionContent: {
      flex: 1,
      padding: 12,
      justifyContent: 'center',
    },
    promotionName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    promotionStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    promotionStat: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    featuredCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.primary,
      overflow: 'hidden',
    },
    featuredHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    featuredImage: {
      width: 88,
      height: 88,
      borderRadius: 44,
      marginRight: 14,
      backgroundColor: colors.border,
    },
    featuredInfo: {
      flex: 1,
    },
    featuredName: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    featuredNickname: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.textSecondary,
      marginTop: 1,
    },
    featuredDetail: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 3,
    },
    featuredChampion: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
      marginTop: 3,
    },
    featuredFightLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: colors.textSecondary,
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 8,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    emptyIcon: {
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    errorContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    errorText: {
      fontSize: 16,
      color: colors.danger,
      textAlign: 'center',
      marginTop: 12,
    },
  });

  if (!q || q.length < 2) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Enter at least 2 characters to search</Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyText, { marginTop: 12 }]}>Searching for "{q}"...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-triangle" size={48} color={colors.danger} />
          <Text style={styles.errorText}>Failed to search. Please try again.</Text>
        </View>
      </View>
    );
  }

  const hasResults = data && (
    data.data.fighters.length > 0 ||
    data.data.fights.length > 0 ||
    data.data.events.length > 0 ||
    data.data.promotions.length > 0
  );

  return (
    <View style={styles.container}>
      {!hasResults ? (
        <View style={styles.emptyState}>
          <FontAwesome name="search" size={64} color={colors.border} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>
            No results found for "{q}"{'\n'}
            Try different keywords or check spelling
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          {/* Featured Fighter — shown when the query clearly targets one fighter */}
          {(() => {
            const featured = data.data.featured;
            if (!featured || featured.type !== 'fighter') return null;
            const fighter = featured.fighter;
            const featuredImageUrl = getFighterImageUrl(fighter.profileImage);
            return (
              <View style={styles.section}>
                <TouchableOpacity
                  style={styles.featuredCard}
                  onPress={() => router.push(`/fighter/${fighter.id}` as any)}
                >
                  <View style={styles.featuredHeader}>
                    <Image
                      source={featuredImageUrl ? { uri: featuredImageUrl } : DEFAULT_FIGHTER_IMAGE}
                      style={styles.featuredImage}
                      resizeMode="cover"
                    />
                    <View style={styles.featuredInfo}>
                      <Text style={styles.featuredName} numberOfLines={1}>
                        {fighter.firstName} {fighter.lastName}
                      </Text>
                      {fighter.nickname ? (
                        <Text style={styles.featuredNickname} numberOfLines={1}>
                          "{fighter.nickname}"
                        </Text>
                      ) : null}
                      <Text style={styles.featuredDetail} numberOfLines={1}>
                        {[fighter.record, formatWeightClass(fighter.weightClass)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      {fighter.isChampion ? (
                        <Text style={styles.featuredChampion} numberOfLines={1}>
                          🏆 {fighter.championshipTitle || 'Champion'}
                        </Text>
                      ) : null}
                      {fighter.totalFights > 0 && fighter.averageRating > 0 ? (
                        <Text style={styles.featuredDetail}>
                          Avg rating (last {fighter.totalFights}{' '}
                          {fighter.totalFights === 1 ? 'fight' : 'fights'}):{' '}
                          {fighter.averageRating.toFixed(1)}/10
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '300', color: colors.textSecondary }}>›</Text>
                  </View>
                </TouchableOpacity>

                {featured.nextFight && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.featuredFightLabel}>NEXT FIGHT</Text>
                    <UpcomingFightCard
                      fight={featured.nextFight}
                      onPress={() => router.push(`/fight/${featured.nextFight.id}` as any)}
                      showEvent={true}
                      index={0}
                    />
                  </View>
                )}
                {!featured.nextFight && featured.lastFight && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.featuredFightLabel}>LAST FIGHT</Text>
                    <CompletedFightCard
                      fight={featured.lastFight}
                      onPress={() => router.push(`/fight/${featured.lastFight.id}?mode=completed` as any)}
                      showEvent={true}
                      index={0}
                    />
                  </View>
                )}
              </View>
            );
          })()}

          {/* Fights Section */}
          {data.data.fights.length > 0 && (() => {
            const featured = data.data.featured;
            const featuredFightId =
              featured?.nextFight?.id ?? (featured && !featured.nextFight ? featured.lastFight?.id : null);
            const visibleFights = data.data.fights.filter(f => f.id !== featuredFightId);
            const upcomingFights = visibleFights.filter(f => f.fightStatus !== 'COMPLETED');
            const completedFights = visibleFights.filter(f => f.fightStatus === 'COMPLETED');

            return (
              <>
                {/* Upcoming Fights */}
                {upcomingFights.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Upcoming Fights</Text>
                      <Text style={styles.resultCount}>({upcomingFights.length})</Text>
                    </View>
                    {upcomingFights.map((fight, index) => (
                      <UpcomingFightCard
                        key={fight.id}
                        fight={fight}
                        onPress={() => router.push(`/fight/${fight.id}` as any)}
                        showEvent={true}
                        index={index}
                      />
                    ))}
                  </View>
                )}

                {/* Completed Fights */}
                {completedFights.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Completed Fights</Text>
                      <Text style={styles.resultCount}>({completedFights.length})</Text>
                    </View>
                    {completedFights.map((fight, index) => (
                      <CompletedFightCard
                        key={fight.id}
                        fight={fight}
                        onPress={() => router.push(`/fight/${fight.id}?mode=completed` as any)}
                        showEvent={true}
                        index={upcomingFights.length + index}
                      />
                    ))}
                  </View>
                )}
              </>
            );
          })()}

          {/* Fighters Section — the featured fighter already has their own card */}
          {(() => {
            const otherFighters = data.data.fighters.filter(
              (fighter) => fighter.id !== data.data.featured?.fighter?.id
            );
            if (otherFighters.length === 0) return null;
            return (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    {data.data.featured ? 'Other Fighters' : 'Fighters'}
                  </Text>
                  <Text style={styles.resultCount}>({otherFighters.length})</Text>
                </View>
                <View style={{ paddingHorizontal: 16 }}>
                  {otherFighters.map((fighter) => (
                    <FighterCard
                      key={fighter.id}
                      fighter={fighter}
                      onPress={() => router.push(`/fighter/${fighter.id}` as any)}
                    />
                  ))}
                </View>
              </View>
            );
          })()}

          {/* Events Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Events</Text>
              <Text style={styles.resultCount}>({data.data.events.length})</Text>
            </View>
            {data.data.events.length > 0 ? (
              data.data.events.map((event) => (
                <SmallEventCard
                  key={event.id}
                  event={event}
                  onPress={() => router.push(`/event/${event.id}` as any)}
                />
              ))
            ) : (
              <View style={styles.card}>
                <Text style={[styles.emptyText, { textAlign: 'center' }]}>
                  No events found
                </Text>
              </View>
            )}
          </View>

          {/* Promotions Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Promotions</Text>
              <Text style={styles.resultCount}>({data.data.promotions.length})</Text>
            </View>
            {data.data.promotions.length > 0 ? (
              data.data.promotions.map((promotion, index) => {
                // Use local UFC logo if promotion is UFC, otherwise use banner image or black placeholder
                const getPromotionImage = () => {
                  if (promotion.name.toUpperCase() === 'UFC') {
                    return require('../assets/promotions/UFC_logo.png');
                  }
                  return promotion.image ? { uri: promotion.image } : null;
                };

                const imageSource = getPromotionImage();

                return (
                  <View key={index} style={styles.promotionCardContainer}>
                    <View style={styles.promotionImageContainer}>
                      {imageSource ? (
                        <Image
                          source={imageSource}
                          style={styles.promotionImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.promotionImage, { backgroundColor: '#000000' }]} />
                      )}
                    </View>
                    <View style={styles.promotionContent}>
                      <Text style={styles.promotionName}>{promotion.name}</Text>
                      <View style={styles.promotionStats}>
                        <Text style={styles.promotionStat}>
                          {promotion.totalEvents} total events
                        </Text>
                        <Text style={styles.promotionStat}>•</Text>
                        <Text style={styles.promotionStat}>
                          {promotion.upcomingEvents} upcoming
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.card}>
                <Text style={[styles.emptyText, { textAlign: 'center' }]}>
                  No promotions found
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
