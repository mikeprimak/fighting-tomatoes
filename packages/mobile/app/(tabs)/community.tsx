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
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../../constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FontAwesome6 } from '@expo/vector-icons';
import { apiService } from '../../services/api';

interface Event {
  id: string;
  name: string;
  date: string;
  venue?: string;
  location?: string;
  promotion: string;
  hasStarted: boolean;
  isComplete: boolean;
}

/**
 * Community Hub - Central page for community-wide data and engagement
 *
 * Features:
 * - Community predictions for upcoming events
 * - Ratings for recent events
 * - Top comments
 * - Top fights list
 * - Top fighters list
 * - Tag lists (best back-and-forth fights, etc.)
 * - Leaderboards (most accurate predictions, etc.)
 */
export default function CommunityScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  // Fetch events from API
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiService.getEvents(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const allEvents = eventsData?.events || [];

  // Get next upcoming UFC event
  const nextUFCEvent = allEvents
    .filter((e: Event) => !e.hasStarted && !e.isComplete && e.promotion?.toUpperCase() === 'UFC')
    .sort((a: Event, b: Event) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  // Fetch prediction stats for the next UFC event
  const { data: predictionData, isLoading: isPredictionsLoading } = useQuery({
    queryKey: ['eventPredictions', nextUFCEvent?.id],
    queryFn: () => apiService.getEventPredictionStats(nextUFCEvent!.id),
    enabled: !!nextUFCEvent?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    seeAllButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    seeAllText: {
      color: colors.tint,
      fontSize: 14,
      fontWeight: '600',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    cardSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    comingSoonContainer: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    comingSoonText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 8,
    },
    iconContainer: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.tint + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -6,
    },
    gridCard: {
      width: '48%',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      margin: '1%',
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    gridIcon: {
      marginBottom: 8,
    },
    gridTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    gridSubtext: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },
    comingSoonBadge: {
      marginTop: 12,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: colors.tint + '20',
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    comingSoonBadgeText: {
      fontSize: 12,
      color: colors.tint,
      fontWeight: '600',
    },
  });

  // Placeholder sections for community features
  const communityFeatures = [
    {
      icon: 'trophy',
      title: 'Leaderboards',
      subtitle: 'Top predictors',
      route: null
    },
    {
      icon: 'star',
      title: 'Top Fights',
      subtitle: 'Highest rated',
      route: null
    },
    {
      icon: 'fire',
      title: 'Trending',
      subtitle: 'Hot topics',
      route: null
    },
    {
      icon: 'tags',
      title: 'Tag Lists',
      subtitle: 'Best moments',
      route: null
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Community Predictions for Next Event */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {isLoading ? 'Loading...' : nextUFCEvent ? `Community Predictions for ${nextUFCEvent.name}` : 'Community Predictions'}
            </Text>
          </View>

          {isLoading ? (
            <View style={[styles.card, { alignItems: 'center', padding: 24 }]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : nextUFCEvent ? (
            <View style={styles.card}>
              {isPredictionsLoading ? (
                <View style={{ alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.cardSubtext, { marginTop: 8 }]}>Loading predictions...</Text>
                </View>
              ) : predictionData && predictionData.totalPredictions > 0 ? (
                <View>

                  {/* Most Hyped Fights */}
                  {predictionData.mostHypedFights.length > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.cardSubtext, { fontWeight: '600', marginBottom: 8 }]}>
                        🔥 Most Hyped Fights
                      </Text>
                      {predictionData.mostHypedFights.map((fight, index) => (
                        <TouchableOpacity
                          key={fight.fightId}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 8,
                            borderBottomWidth: index < predictionData.mostHypedFights.length - 1 ? 1 : 0,
                            borderBottomColor: colors.border,
                          }}
                          onPress={() => router.push(`/fight/${fight.fightId}` as any)}
                        >
                          <Text style={[styles.cardSubtext, { fontSize: 13, marginRight: 8, width: 16 }]}>
                            {index + 1}.
                          </Text>
                          {fight.fighter1.profileImage && (
                            <Image
                              source={{ uri: fight.fighter1.profileImage.startsWith('http') ? fight.fighter1.profileImage : `${apiService.baseURL}${fight.fighter1.profileImage}` }}
                              style={{ width: 32, height: 32, borderRadius: 16, marginRight: 6 }}
                            />
                          )}
                          <Text style={[styles.cardSubtext, { fontSize: 13, marginRight: 4 }]}>vs</Text>
                          {fight.fighter2.profileImage && (
                            <Image
                              source={{ uri: fight.fighter2.profileImage.startsWith('http') ? fight.fighter2.profileImage : `${apiService.baseURL}${fight.fighter2.profileImage}` }}
                              style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }}
                            />
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cardSubtext, { fontSize: 13 }]}>
                              {fight.fighter1.name} vs {fight.fighter2.name}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                              <FontAwesome6
                                name="fire-flame-curved"
                                size={14}
                                color='#FF6B35'
                                style={{ marginRight: 4 }}
                              />
                              <Text style={[styles.cardSubtext, { fontSize: 12, color: colors.textSecondary }]}>
                                {fight.averageHype}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Top Predicted Winners */}
                  {predictionData.topFighters.length > 0 && (
                    <View>
                      <Text style={[styles.cardSubtext, { fontWeight: '600', marginBottom: 8 }]}>
                        🏆 Top Predicted Winners
                      </Text>
                      {predictionData.topFighters.slice(0, 5).map((fighter, index) => {
                        const percentage = fighter.totalFightPredictions > 0
                          ? Math.round((fighter.winPredictions / fighter.totalFightPredictions) * 100)
                          : 0;

                        return (
                          <TouchableOpacity
                            key={fighter.fighterId}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 6,
                              borderBottomWidth: index < Math.min(predictionData.topFighters.length, 5) - 1 ? 1 : 0,
                              borderBottomColor: colors.border,
                            }}
                            onPress={() => router.push(`/fight/${fighter.fightId}` as any)}
                          >
                            <Text style={[styles.cardSubtext, { fontSize: 13, marginRight: 8, width: 16 }]}>
                              {index + 1}.
                            </Text>
                            {fighter.profileImage && (
                              <Image
                                source={{ uri: fighter.profileImage.startsWith('http') ? fighter.profileImage : `${apiService.baseURL}${fighter.profileImage}` }}
                                style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }}
                              />
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.cardSubtext, { fontSize: 13 }]}>
                                {percentage}% picked {fighter.name} to beat {fighter.opponent.name}.
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonBadgeText}>
                    No predictions yet - be the first!
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No upcoming UFC events</Text>
              <Text style={styles.cardSubtext}>
                Check back later for community predictions
              </Text>
            </View>
          )}
        </View>

        {/* Recent Ratings Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Ratings</Text>
            <TouchableOpacity style={styles.seeAllButton}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Latest community ratings</Text>
            <Text style={styles.cardSubtext}>
              Discover what the community thought of recent events
            </Text>
          </View>
        </View>

        {/* Quick Links Grid */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Explore</Text>
          <View style={styles.gridContainer}>
            {communityFeatures.map((feature, index) => (
              <TouchableOpacity
                key={index}
                style={styles.gridCard}
                onPress={() => {
                  if (feature.route) {
                    router.push(feature.route as any);
                  }
                }}
                disabled={!feature.route}
              >
                <FontAwesome
                  name={feature.icon as any}
                  size={24}
                  color={colors.tint}
                  style={styles.gridIcon}
                />
                <Text style={styles.gridTitle}>{feature.title}</Text>
                <Text style={styles.gridSubtext}>{feature.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Top Comments Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Comments</Text>
            <TouchableOpacity style={styles.seeAllButton}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Featured community reviews</Text>
            <Text style={styles.cardSubtext}>
              Read the best takes from the community
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
