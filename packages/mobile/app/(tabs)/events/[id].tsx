import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Image,
  StatusBar,
  Animated,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { FightDisplayCard, RateFightModal, PredictionModal } from '../../../components';
import { useAuth } from '../../../store/AuthContext';
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
  bannerImage?: string | null;
  mainStartTime?: string | null;
  prelimStartTime?: string | null;
}

type Fight = any;

// Placeholder image selection logic - same as EventCard
const getPlaceholderImage = (eventId: string) => {
  const images = [
    require('../../../assets/events/event-banner-1.jpg'),
    require('../../../assets/events/event-banner-2.jpg'),
    require('../../../assets/events/event-banner-3.jpg'),
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
  const insets = useSafeAreaInsets();

  // Modal state
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [bannerAspectRatio, setBannerAspectRatio] = useState<number>(16 / 9);

  // Pulsing animation for live indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  const event = eventData?.event;
  const fights = fightsData?.fights || [];

  // Helper to check if event is currently live
  const isEventLive = (event: EventDetails | undefined) => {
    if (!event || event.isComplete) return false;

    const now = new Date();

    // Get the earliest start time (prelims or main card)
    const earliestTime = event.prelimStartTime || event.mainStartTime;
    if (!earliestTime) return event.hasStarted; // Fallback to hasStarted flag

    const startTime = new Date(earliestTime);
    return now >= startTime && !event.isComplete;
  };

  const eventIsLive = isEventLive(event);

  // Start pulsing animation when event is live
  useEffect(() => {
    if (eventIsLive) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [eventIsLive, pulseAnim]);

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

  const handleBannerLoad = (e: any) => {
    const { width, height } = e.nativeEvent.source;
    if (width && height) {
      setBannerAspectRatio(width / height);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const timeString = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    return timeString;
  };

  const getDisplayTime = (event: EventDetails | undefined) => {
    if (!event) return null;
    if (event.mainStartTime) {
      return formatTime(event.mainStartTime);
    }
    return null;
  };

  if (eventLoading || fightsLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading event...</Text>
        </View>
      </View>
    );
  }

  if (eventError || fightsError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
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
      </View>
    );
  }

  // Group fights by card section based on orderOnCard
  // Lower orderOnCard = main event (most important fights first)
  const mainCard = fights.filter((f: Fight) => f.orderOnCard <= 5);
  const prelimCard = fights.filter((f: Fight) => f.orderOnCard > 5 && f.orderOnCard <= 9);
  const earlyPrelims = fights.filter((f: Fight) => f.orderOnCard > 9);

  // Debug: log fight ordering
  console.log('Fight ordering debug:', {
    totalFights: fights.length,
    mainCardCount: mainCard.length,
    prelimCardCount: prelimCard.length,
    earlyPrelimsCount: earlyPrelims.length,
    mainCardOrders: mainCard.map(f => f.orderOnCard),
    prelimCardOrders: prelimCard.map(f => f.orderOnCard),
    earlyPrelimsOrders: earlyPrelims.map(f => f.orderOnCard),
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backIcon}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <FontAwesome name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={1}>
            {event?.name || (eventLoading ? 'Loading...' : 'Event Details')}
          </Text>
          <View style={styles.eventDateRow}>
            <Text style={[styles.eventDate, { color: colors.textSecondary }]} numberOfLines={1}>
              {event?.date && formatDate(event.date)}
              {!eventIsLive && getDisplayTime(event) && ` • Main @ ${getDisplayTime(event)}`}
            </Text>
            {eventIsLive && (
              <View style={styles.liveIndicator}>
                <Animated.View
                  style={[
                    styles.liveDot,
                    {
                      backgroundColor: colors.danger,
                      opacity: pulseAnim,
                    },
                  ]}
                />
                <Text style={[styles.liveText, { color: colors.danger }]}>Live</Text>
              </View>
            )}
          </View>
          {(event?.venue || event?.location) && (
            <Text style={[styles.eventLocation, { color: colors.textSecondary }]} numberOfLines={1}>
              {[event.venue, event.location]
                .filter(Boolean)
                .map(s => s.trim())
                .filter(s => s.length > 0)
                .join(', ')
                .replace(/,\s*,/g, ',')
                .replace(/^,\s*/, '')
                .replace(/\s*,$/, '')}
            </Text>
          )}
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
            source={event.bannerImage ? { uri: event.bannerImage } : getPlaceholderImage(event.id)}
            style={[styles.eventBanner, { aspectRatio: bannerAspectRatio }]}
            resizeMode="cover"
            onLoad={handleBannerLoad}
          />
        )}

        {/* Main Card */}
        {mainCard.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              MAIN CARD
            </Text>
            {[...mainCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
              <FightDisplayCard
                key={fight.id}
                fight={fight}
                onPress={() => handleFightPress(fight)}
                showEvent={false}
              />
            ))}
          </View>
        )}

        {/* Preliminary Card */}
        {prelimCard.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              PRELIMINARY CARD
            </Text>
            {[...prelimCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight) => (
              <FightDisplayCard
                key={fight.id}
                fight={fight}
                onPress={() => handleFightPress(fight)}
                showEvent={false}
              />
            ))}
          </View>
        )}

        {/* Early Prelims */}
        {earlyPrelims.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              EARLY PRELIMS
            </Text>
            {[...earlyPrelims].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight) => (
              <FightDisplayCard
                key={fight.id}
                fight={fight}
                onPress={() => handleFightPress(fight)}
                showEvent={false}
              />
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
    </View>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backIcon: {
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
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
  eventDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  liveText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventLocation: {
    fontSize: 14,
    marginTop: 2,
  },
  scrollContainer: {
    paddingBottom: 20,
  },
  eventBanner: {
    width: '100%',
    height: undefined,
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
    marginBottom: 4,
  },
  mainCardTime: {
    fontSize: 14,
    marginBottom: 12,
    fontWeight: '500',
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
}); 
