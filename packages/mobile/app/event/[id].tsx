import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { FightDisplayCard, RateFightModal, PredictionModal } from '../../components';
import { useAuth } from '../../store/AuthContext';
import { FontAwesome } from '@expo/vector-icons';

interface EventDetails {
  id: string;
  name: string;
  date: string;
  venue?: string;
  location?: string;
  promotion: string;
  hasStarted: boolean;
  isComplete: boolean;
}

interface Fight {
  id: string;
  orderOnCard: number;
  weightClass?: string;
  isTitle: boolean;
  titleName?: string;
  hasStarted: boolean;
  isComplete: boolean;
  winner?: string;
  method?: string;
  round?: number;
  time?: string;
  averageRating: number;
  totalRatings: number;
  totalReviews: number;
  event: EventDetails;
  fighter1: {
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    wins: number;
    losses: number;
    draws: number;
  };
  fighter2: {
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    wins: number;
    losses: number;
    draws: number;
  };
  userRating?: number;
  userReview?: {
    content: string;
  };
  userTags?: Array<{ name: string }>;
}

// Same image selection logic as EventCard
const getEventImage = (eventId: string) => {
  const images = [
    require('../../assets/events/event-banner-1.jpg'),
    require('../../assets/events/event-banner-2.jpg'),
    require('../../assets/events/event-banner-3.jpg'),
  ];

  // Use charCodeAt to get a number from the last character (works for letters and numbers)
  const lastCharCode = eventId.charCodeAt(eventId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Modal state
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showPredictionModal, setShowPredictionModal] = useState(false);

  // Fetch event details
  const { data: eventData, isLoading: eventLoading, error: eventError } = useQuery({
    queryKey: ['event', id],
    queryFn: () => apiService.getEvent(id as string),
    enabled: !!id,
  });

  // Fetch fights for the event
  const { data: fightsData, isLoading: fightsLoading, error: fightsError } = useQuery({
    queryKey: ['eventFights', id, isAuthenticated],
    queryFn: async () => {
      console.log('Fetching fights for event:', id, 'with user data:', isAuthenticated);
      const response = await apiService.getFights({
        eventId: id as string,
        includeUserData: isAuthenticated,
        limit: 50
      });

      console.log('Received fights response:', {
        fightsCount: response.fights.length,
        firstFightUserData: response.fights[0] ? {
          id: response.fights[0].id,
          hasUserRating: !!response.fights[0].userRating,
          hasUserReview: !!response.fights[0].userReview,
          hasUserTags: !!response.fights[0].userTags,
          userRating: response.fights[0].userRating,
          userReview: response.fights[0].userReview,
          userTags: response.fights[0].userTags
        } : null
      });

      // Sort fights by orderOnCard descending (main event first)
      response.fights.sort((a: any, b: any) => b.orderOnCard - a.orderOnCard);
      return response;
    },
    enabled: !!id,
  });

  const openRatingModal = async (fight: Fight) => {
    try {
      console.log('Opening rating modal for fight:', fight.id);
      console.log('Fight already has user data:', {
        hasUserRating: !!fight.userRating,
        hasUserReview: !!fight.userReview,
        hasUserTags: !!fight.userTags,
        userRating: fight.userRating,
        userReview: fight.userReview,
        userTags: fight.userTags
      });

      // Check if we already have user data from the initial query
      const hasUserData = fight.userRating || fight.userReview || (fight.userTags && fight.userTags.length > 0);

      if (user?.id && !hasUserData) {
        console.log('No user data found, fetching detailed fight data...');
        const { fight: detailedFight } = await apiService.getFight(fight.id);

        console.log('Detailed fight data received:', {
          hasUserRating: !!detailedFight.userRating,
          hasUserReview: !!detailedFight.userReview,
          hasUserTags: !!detailedFight.userTags,
          userRating: detailedFight.userRating,
          userReview: detailedFight.userReview,
          userTags: detailedFight.userTags
        });

        // Update the selected fight with enriched data
        const enrichedFight = {
          ...fight,
          userRating: detailedFight.userRating,
          userReview: detailedFight.userReview,
          userTags: detailedFight.userTags
        };

        setSelectedFight(enrichedFight);
      } else {
        console.log('Using existing fight data (user data already present or user not logged in)');
        setSelectedFight(fight);
      }

      setShowRatingModal(true);
    } catch (error) {
      console.error('Error fetching detailed fight data:', error);
      console.log('Proceeding with basic fight data due to error');
      // If fetch fails, just proceed with basic data
      setSelectedFight(fight);
      setShowRatingModal(true);
    }
  };

  const openPredictionModal = (fight: Fight) => {
    console.log('Opening prediction modal for fight:', fight.id);
    setSelectedFight(fight);
    setShowPredictionModal(true);
  };

  const handleFightPress = (fight: Fight) => {
    // Determine which modal to open based on fight status
    if (fight.hasStarted || fight.isComplete) {
      // For ongoing or completed fights, open rating modal
      openRatingModal(fight);
    } else {
      // For upcoming fights, open prediction modal
      openPredictionModal(fight);
    }
  };

  const closeModal = () => {
    setSelectedFight(null);
    setShowRatingModal(false);
    setShowPredictionModal(false);
  };

  if (eventLoading || fightsLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading event...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (eventError || fightsError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            Error loading event details
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.backButtonText, { color: colors.textOnAccent }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const event = eventData?.event;
  const fights = fightsData?.fights || [];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Group fights by card section
  const mainCard = fights.filter((f: Fight) => f.orderOnCard >= 9);
  const prelimCard = fights.filter((f: Fight) => f.orderOnCard >= 5 && f.orderOnCard < 9);
  const earlyPrelims = fights.filter((f: Fight) => f.orderOnCard < 5);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <FontAwesome name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={1}>
            {event?.name || (eventLoading ? 'Loading...' : 'Event Details')}
          </Text>
          <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
            {event?.date && formatDate(event.date)}
          </Text>
        </View>
      </View>

      <View style={styles.contentContainer}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
        {/* Event Banner Image */}
        {event?.id && (
          <Image
            source={getEventImage(event.id)}
            style={styles.eventBanner}
            resizeMode="cover"
          />
        )}

        {/* Event Info */}
        <View style={[styles.eventInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.venue, { color: colors.text }]}>
            {event?.venue}
          </Text>
          <Text style={[styles.location, { color: colors.textSecondary }]}>
            {event?.location}
          </Text>
          <View style={styles.statsRow}>
            <Text style={[styles.stat, { color: colors.text }]}>
              {fights.length} Fights
            </Text>
            {event?.isComplete && (
              <View style={[styles.badge, { backgroundColor: colors.success }]}>
                <Text style={styles.badgeText}>Complete</Text>
              </View>
            )}
            {event?.hasStarted && !event?.isComplete && (
              <View style={[styles.badge, { backgroundColor: colors.warning }]}>
                <Text style={styles.badgeText}>Live</Text>
              </View>
            )}
          </View>
        </View>

        {/* Main Card */}
        {mainCard.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              MAIN CARD
            </Text>
            {mainCard.map((fight: Fight, index: number) => (
              <View key={fight.id} style={styles.fightCard}>
                <View style={[styles.fight, {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderTopWidth: index === 0 ? 2 : 1,
                  borderTopColor: index === 0 ? colors.primary : colors.border,
                }]}>
                  {index === 0 && (
                    <View style={[styles.mainEventBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.mainEventText}>MAIN EVENT</Text>
                    </View>
                  )}
                  {index === 1 && (
                    <View style={[styles.coMainBadge, { backgroundColor: colors.secondary }]}>
                      <Text style={styles.coMainText}>CO-MAIN EVENT</Text>
                    </View>
                  )}

                  <FightDisplayCard
                    fight={fight}
                    onPress={() => handleFightPress(fight)}
                    showEvent={false}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Preliminary Card */}
        {prelimCard.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              PRELIMINARY CARD
            </Text>
            {prelimCard.map((fight: Fight) => (
              <View key={fight.id} style={styles.fightCard}>
                <View style={[styles.fight, {
                  backgroundColor: colors.card,
                  borderColor: colors.border
                }]}>
                  <FightDisplayCard
                    fight={fight}
                    onPress={() => handleFightPress(fight)}
                    showEvent={false}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Early Prelims */}
        {earlyPrelims.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              EARLY PRELIMS
            </Text>
            {earlyPrelims.map((fight: Fight) => (
              <View key={fight.id} style={styles.fightCard}>
                <View style={[styles.fight, {
                  backgroundColor: colors.card,
                  borderColor: colors.border
                }]}>
                  <FightDisplayCard
                    fight={fight}
                    onPress={() => handleFightPress(fight)}
                    showEvent={false}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* No Fights Message */}
        {fights.length === 0 && !fightsLoading && (
          <View style={styles.noFightsContainer}>
            <Text style={[styles.noFightsText, { color: colors.textSecondary }]}>
              No fights available for this event yet.
            </Text>
          </View>
        )}
        </ScrollView>

        {/* Custom Tab Bar */}
        <View style={[styles.tabBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => router.push('/(tabs)/')}
          >
            <FontAwesome name="calendar" size={24} color={colors.tint} />
            <Text style={[styles.tabLabel, { color: colors.tint }]}>Events</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => router.push('/(tabs)/fights')}
          >
            <FontAwesome name="star" size={24} color={colors.tabIconDefault} />
            <Text style={[styles.tabLabel, { color: colors.tabIconDefault }]}>Fights</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <FontAwesome name="user" size={24} color={colors.tabIconDefault} />
            <Text style={[styles.tabLabel, { color: colors.tabIconDefault }]}>Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Rating Modal */}
      <RateFightModal
        visible={showRatingModal}
        fight={selectedFight}
        onClose={closeModal}
        queryKey={['eventFights', id]}
      />

      <PredictionModal
        visible={showPredictionModal}
        fight={selectedFight}
        onClose={closeModal}
        onSuccess={() => {
          // Invalidate fights query to refresh data
          console.log('Prediction submitted successfully');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backIcon: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  eventName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  eventDate: {
    fontSize: 14,
    marginTop: 2,
  },
  scrollContainer: {
    paddingBottom: 20,
  },
  eventBanner: {
    width: '100%',
    height: 200,
    marginBottom: 16,
  },
  eventInfo: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  venue: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  location: {
    fontSize: 14,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stat: {
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  fightCard: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  fight: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mainEventBadge: {
    position: 'absolute',
    top: -1,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    zIndex: 10,
  },
  mainEventText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  coMainBadge: {
    position: 'absolute',
    top: -1,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    zIndex: 10,
  },
  coMainText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
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
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  noFightsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 40,
  },
  noFightsText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 8,
    paddingBottom: 20, // Extra padding for safe area
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
});