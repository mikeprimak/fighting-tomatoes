import React from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';

/**
 * Search Results Screen
 * Displays search results across fighters, fights, events, and promotions
 */
export default function SearchResultsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', q],
    queryFn: () => apiService.search(q || '', 10),
    enabled: !!q && q.length >= 2,
    staleTime: 2 * 60 * 1000, // 2 minutes
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
    fighterCard: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    fighterImage: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.border,
      marginRight: 12,
    },
    fighterInfo: {
      flex: 1,
    },
    fighterName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    fighterNickname: {
      fontSize: 14,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginBottom: 4,
    },
    fighterRecord: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    championBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      marginTop: 6,
      alignSelf: 'flex-start',
    },
    championText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
      marginLeft: 4,
    },
    fightCard: {
      gap: 8,
    },
    fightHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    fightTitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    titleBadge: {
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    titleText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
    },
    fighters: {
      gap: 4,
    },
    fighterRow: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
    },
    vsText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginVertical: 4,
    },
    eventCard: {
      gap: 8,
    },
    eventName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    eventDetails: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    promotionCard: {
      gap: 6,
    },
    promotionName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    promotionStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    promotionStat: {
      fontSize: 14,
      color: colors.textSecondary,
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
      color: colors.error,
      textAlign: 'center',
      marginTop: 12,
    },
  });

  if (!q || q.length < 2) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Search</Text>
          <Text style={styles.queryText}>Enter at least 2 characters to search</Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Searching...</Text>
          <Text style={styles.queryText}>"{q}"</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Search Error</Text>
          <Text style={styles.queryText}>"{q}"</Text>
        </View>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-triangle" size={48} color={colors.error} />
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
      <View style={styles.header}>
        <Text style={styles.headerText}>Search Results</Text>
        <Text style={styles.queryText}>
          "{q}" - {data?.meta.totalResults || 0} results
        </Text>
      </View>

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
          {/* Fighters Section */}
          {data.data.fighters.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Fighters</Text>
                <Text style={styles.resultCount}>({data.data.fighters.length})</Text>
              </View>
              {data.data.fighters.map((fighter) => (
                <TouchableOpacity
                  key={fighter.id}
                  style={[styles.card, styles.fighterCard]}
                  onPress={() => router.push(`/fighter/${fighter.id}` as any)}
                >
                  {fighter.profileImage ? (
                    <Image source={{ uri: fighter.profileImage }} style={styles.fighterImage} />
                  ) : (
                    <View style={styles.fighterImage}>
                      <FontAwesome
                        name="user"
                        size={30}
                        color={colors.textSecondary}
                        style={{ alignSelf: 'center', marginTop: 15 }}
                      />
                    </View>
                  )}
                  <View style={styles.fighterInfo}>
                    <Text style={styles.fighterName}>
                      {fighter.firstName} {fighter.lastName}
                    </Text>
                    {fighter.nickname && (
                      <Text style={styles.fighterNickname}>"{fighter.nickname}"</Text>
                    )}
                    <Text style={styles.fighterRecord}>
                      {fighter.record} • {fighter.weightClass?.replace('_', ' ')}
                    </Text>
                    {fighter.isChampion && (
                      <View style={styles.championBadge}>
                        <FontAwesome name="trophy" size={12} color={colors.primary} />
                        <Text style={styles.championText}>Champion</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Fights Section */}
          {data.data.fights.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Fights</Text>
                <Text style={styles.resultCount}>({data.data.fights.length})</Text>
              </View>
              {data.data.fights.map((fight) => (
                <TouchableOpacity
                  key={fight.id}
                  style={[styles.card, styles.fightCard]}
                  onPress={() => router.push(`/fight/${fight.id}` as any)}
                >
                  <View style={styles.fightHeader}>
                    <Text style={styles.fightTitle}>{fight.event.name}</Text>
                    {fight.isTitle && (
                      <View style={styles.titleBadge}>
                        <Text style={styles.titleText}>TITLE</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.fighters}>
                    <Text style={styles.fighterRow}>
                      {fight.fighter1.firstName} {fight.fighter1.lastName}
                    </Text>
                    <Text style={styles.vsText}>vs</Text>
                    <Text style={styles.fighterRow}>
                      {fight.fighter2.firstName} {fight.fighter2.lastName}
                    </Text>
                  </View>
                  <Text style={styles.eventDetails}>
                    {fight.event.promotion} • {new Date(fight.event.date).toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Events Section */}
          {data.data.events.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Events</Text>
                <Text style={styles.resultCount}>({data.data.events.length})</Text>
              </View>
              {data.data.events.map((event) => (
                <TouchableOpacity
                  key={event.id}
                  style={[styles.card, styles.eventCard]}
                  onPress={() => router.push(`/event/${event.id}` as any)}
                >
                  <Text style={styles.eventName}>{event.name}</Text>
                  <Text style={styles.eventDetails}>
                    {event.promotion} • {new Date(event.date).toLocaleDateString()}
                  </Text>
                  {event.location && (
                    <Text style={styles.eventDetails}>{event.location}</Text>
                  )}
                  {event.totalRatings > 0 && (
                    <Text style={styles.eventDetails}>
                      ⭐ {event.averageRating.toFixed(1)}/10 ({event.totalRatings} ratings)
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Promotions Section */}
          {data.data.promotions.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Promotions</Text>
                <Text style={styles.resultCount}>({data.data.promotions.length})</Text>
              </View>
              {data.data.promotions.map((promotion, index) => (
                <View key={index} style={[styles.card, styles.promotionCard]}>
                  <Text style={styles.promotionName}>{promotion.name}</Text>
                  <View style={styles.promotionStats}>
                    <Text style={styles.promotionStat}>
                      {promotion.totalEvents} total events
                    </Text>
                    <Text style={styles.promotionStat}>•</Text>
                    <Text style={styles.promotionStat}>
                      {promotion.upcomingEvents} upcoming
                    </Text>
                    {promotion.averageRating > 0 && (
                      <>
                        <Text style={styles.promotionStat}>•</Text>
                        <Text style={styles.promotionStat}>
                          ⭐ {promotion.averageRating.toFixed(1)}/10 avg
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
