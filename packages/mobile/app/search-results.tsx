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
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../constants/Colors';
import { apiService } from '../services/api';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import UpcomingFightCard from '../components/fight-cards/UpcomingFightCard';
import CompletedFightCard from '../components/fight-cards/CompletedFightCard';
import FighterCard from '../components/FighterCard';
import SmallEventCard from '../components/SmallEventCard';

/**
 * Search Results Screen
 * Displays search results across fighters, fights, events, and promotions
 */
export default function SearchResultsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const navigation = useNavigation();
  const { q } = useLocalSearchParams<{ q: string }>();

  // Set the navigation header title to show the search query
  useLayoutEffect(() => {
    if (q) {
      navigation.setOptions({
        title: `Search Results - "${q}"`,
      });
    }
  }, [q, navigation]);

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
    columnHeadersUpcoming: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      marginLeft: -11,
      width: 40,
      justifyContent: 'center',
    },
    columnHeadersUpcomingRight: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      marginRight: -11,
      width: 40,
      justifyContent: 'center',
    },
    columnHeadersCompleted: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      marginLeft: -14,
      width: 60,
      justifyContent: 'center',
    },
    columnHeadersCompletedRight: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      marginRight: -17,
      width: 60,
      justifyContent: 'center',
    },
    columnHeaderText: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.5,
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
              <View style={{ paddingHorizontal: 16 }}>
                {data.data.fighters.map((fighter) => (
                  <FighterCard
                    key={fighter.id}
                    fighter={fighter}
                    avgRating={fighter.averageRating}
                    fightCount={fighter.totalFights}
                    onPress={() => router.push(`/fighter/${fighter.id}` as any)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Fights Section */}
          {data.data.fights.length > 0 && (() => {
            const upcomingFights = data.data.fights.filter(f => !f.isComplete);
            const completedFights = data.data.fights.filter(f => f.isComplete);

            return (
              <>
                {/* Upcoming Fights */}
                {upcomingFights.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Upcoming Fights</Text>
                      <Text style={styles.resultCount}>({upcomingFights.length})</Text>
                    </View>
                    <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
                      {/* Left Column Header - ALL / HYPE */}
                      <View style={styles.columnHeadersUpcoming}>
                        <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                          ALL
                        </Text>
                        <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                          HYPE
                        </Text>
                      </View>

                      {/* Right Column Header - MY / HYPE */}
                      <View style={styles.columnHeadersUpcomingRight}>
                        <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                          MY
                        </Text>
                        <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                          HYPE
                        </Text>
                      </View>
                    </View>
                    {upcomingFights.map((fight) => (
                      <UpcomingFightCard
                        key={fight.id}
                        fight={fight}
                        onPress={() => router.push(`/fight/${fight.id}` as any)}
                        showEvent={true}
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
                    <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
                      {/* Left Column Header - ALL / RATINGS */}
                      <View style={styles.columnHeadersCompleted}>
                        <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                          ALL
                        </Text>
                        <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                          RATINGS
                        </Text>
                      </View>

                      {/* Right Column Header - MY / RATING */}
                      <View style={styles.columnHeadersCompletedRight}>
                        <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                          MY
                        </Text>
                        <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                          RATING
                        </Text>
                      </View>
                    </View>
                    {completedFights.map((fight) => (
                      <CompletedFightCard
                        key={fight.id}
                        fight={fight}
                        onPress={() => router.push(`/fight/${fight.id}` as any)}
                        showEvent={true}
                      />
                    ))}
                  </View>
                )}
              </>
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
                    return require('../../assets/promotions/UFC_logo.png');
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
