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
import { useLocalSearchParams, router, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { FightDisplayCard, ScreenHeader } from '../../components';
import { useAuth } from '../../store/AuthContext';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { useLiveEventPolling } from '../../hooks/useLiveEventPolling';

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
  earlyPrelimStartTime?: string | null;
  prelimStartTime?: string | null;
  mainStartTime?: string | null;
}

type Fight = any;

// Placeholder image selection logic - same as EventCard
const getPlaceholderImage = (eventId: string) => {
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
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();

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
      console.log('[FIGHT ORDER] Fetching fights for event:', id);
      const response = await apiService.getFights({
        eventId: id as string,
        includeUserData: isAuthenticated,
        limit: 50
      });

      console.log('[FIGHT ORDER] API returned fights:', response.fights.map((f: any) => ({
        fighters: `${f.fighter1.lastName} vs ${f.fighter2.lastName || f.fighter2.firstName}`,
        orderOnCard: f.orderOnCard
      })));

      // Sort fights by orderOnCard descending (main event first)
      response.fights.sort((a: any, b: any) => b.orderOnCard - a.orderOnCard);

      console.log('[FIGHT ORDER] After sorting (descending):', response.fights.map((f: any) => ({
        fighters: `${f.fighter1.lastName} vs ${f.fighter2.lastName || f.fighter2.firstName}`,
        orderOnCard: f.orderOnCard
      })));

      return response;
    },
    enabled: !!id,
  });

  const event = eventData?.event;
  const fights = fightsData?.fights || [];

  // Helper to check if event is currently live
  const isEventLive = (event: EventDetails | undefined) => {
    if (!event || event.isComplete) return false;

    // Primary check: if event has explicitly started and isn't complete, it's live
    if (event.hasStarted && !event.isComplete) return true;

    // Secondary time-based check for scheduled events
    const now = new Date();
    const earliestTime = event.prelimStartTime || event.mainStartTime;
    if (!earliestTime) return false;

    const startTime = new Date(earliestTime);
    return now >= startTime && !event.isComplete;
  };

  const eventIsLive = isEventLive(event);

  // Enable live polling when event is live
  useLiveEventPolling({
    eventId: id as string,
    isLive: eventIsLive,
    intervalMs: 10000, // Poll every 10 seconds
  });

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

  const handleFightPress = (fight: Fight) => {
    // Navigate to fight detail screen
    router.push(`/fight/${fight.id}` as any);
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

  // Check if any fight is currently live
  const hasLiveFight = fights.some((f: Fight) => f.hasStarted && !f.isComplete);

  // Determine the next fight to start (highest orderOnCard that hasn't started)
  // Fights execute in reverse order: early prelims (high numbers) → prelims → main card (low numbers)
  const nextFight = fights
    .filter((f: Fight) => !f.hasStarted && !f.isComplete)
    .sort((a, b) => b.orderOnCard - a.orderOnCard)[0]; // Highest orderOnCard first

  // Find the most recently completed fight (for timing "Up next..." messages)
  const lastCompletedFight = fights
    .filter((f: Fight) => f.isComplete)
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime; // Most recent first
    })[0];

  // Group fights by card section using cardType from UFC.com scraper (dynamic, no hardcoded thresholds!)
  // Fallback to orderOnCard if cardType is missing (legacy events)
  const mainCard = fights.filter((f: Fight) => {
    if (f.cardType) return f.cardType === 'Main Card';
    // Legacy fallback
    return f.orderOnCard <= 6;
  });

  const prelimCard = fights.filter((f: Fight) => {
    if (f.cardType) return f.cardType === 'Prelims';
    // Legacy fallback
    return f.orderOnCard > 6 && f.orderOnCard <= 13;
  });

  const earlyPrelims = fights.filter((f: Fight) => {
    if (f.cardType) return f.cardType === 'Early Prelims';
    // Legacy fallback
    return f.orderOnCard > 13;
  });

  // Debug: log fight grouping
  console.log('[FIGHT ORDER] Grouped fights (using cardType from UFC.com):');
  console.log('  Main Card:', mainCard.map((f: any) => `${f.fighter1.lastName} vs ${f.fighter2.lastName || f.fighter2.firstName} (order: ${f.orderOnCard}, cardType: ${f.cardType || 'legacy'})`));
  console.log('  Prelims:', prelimCard.map((f: any) => `${f.fighter1.lastName} vs ${f.fighter2.lastName || f.fighter2.firstName} (order: ${f.orderOnCard}, cardType: ${f.cardType || 'legacy'})`));
  console.log('  Early Prelims:', earlyPrelims.map((f: any) => `${f.fighter1.lastName} vs ${f.fighter2.lastName || f.fighter2.firstName} (order: ${f.orderOnCard}, cardType: ${f.cardType || 'legacy'})`));

  // Helper function to check if any fight in a card section has started
  const hasCardSectionStarted = (fights: Fight[]) => {
    return fights.some((f: Fight) => f.hasStarted || f.isComplete);
  };

  // Check if each card section has started
  const mainCardStarted = hasCardSectionStarted(mainCard);
  const prelimCardStarted = hasCardSectionStarted(prelimCard);
  const earlyPrelimsStarted = hasCardSectionStarted(earlyPrelims);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Custom Header */}
      <View style={[styles.header, { backgroundColor: colors.card, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backIcon}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={1}>
            {event?.name || 'Loading...'}
          </Text>
          <View style={styles.eventDateRow}>
            {event && !event.isComplete && eventIsLive ? (
              // When live, only show Live indicator (no date)
              <View style={styles.liveIndicator}>
                <Animated.View style={[
                  styles.liveDot,
                  { backgroundColor: colors.danger, opacity: pulseAnim }
                ]} />
                <Text style={[styles.liveText, { color: colors.danger }]}>Live</Text>
              </View>
            ) : (
              // When not live, show date and optional time
              <>
                <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
                  {event ? formatDate(event.date) : ''}
                </Text>
                {event && !event.isComplete && getDisplayTime(event) && (
                  <Text style={[styles.eventDate, { color: colors.textSecondary }]}> • Main @ {getDisplayTime(event)}</Text>
                )}
              </>
            )}
          </View>
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
            {/* Section Header with Column Headers and Title/Time */}
            <View style={styles.sectionHeader}>
              {event.isComplete ? (
                <>
                  {/* Left Column Header - ALL / RATINGS */}
                  <View style={styles.columnHeaders}>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>ALL</Text>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATINGS</Text>
                  </View>

                  {/* Center - Title and Time stacked vertically */}
                  <View style={styles.sectionHeaderCenter}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>MAIN CARD</Text>
                    {event.mainStartTime && !mainCardStarted && (
                      <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                        {formatTime(event.mainStartTime)}
                      </Text>
                    )}
                  </View>

                  {/* Right Column Header - MY / RATING */}
                  <View style={styles.columnHeadersRight}>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>MY</Text>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>RATING</Text>
                  </View>
                </>
              ) : (
                <>
                  {/* Left Column Header - ALL / HYPE */}
                  <View style={styles.columnHeaders}>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>ALL</Text>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>HYPE</Text>
                  </View>

                  {/* Center - Title and Time stacked vertically */}
                  <View style={styles.sectionHeaderCenter}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>MAIN CARD</Text>
                    {event.mainStartTime && !mainCardStarted && (
                      <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                        {formatTime(event.mainStartTime)}
                      </Text>
                    )}
                  </View>

                  {/* Right Column Header - MY / HYPE */}
                  <View style={styles.columnHeadersRight}>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>MY</Text>
                    <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>HYPE</Text>
                  </View>
                </>
              )}
            </View>

            {[...mainCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
              <FightDisplayCard
                key={fight.id}
                fight={fight}
                onPress={() => handleFightPress(fight)}
                showEvent={false}
                isNextFight={nextFight?.id === fight.id}
                hasLiveFight={hasLiveFight}
                lastCompletedFightTime={lastCompletedFight?.updatedAt}
                index={index}
              />
            ))}
          </View>
        )}

        {/* Preliminary Card */}
        {prelimCard.length > 0 && (
          <View style={styles.cardSection}>
            {/* Section Header - Center Only (No Column Headers) */}
            <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
              <View style={styles.sectionHeaderCenter}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PRELIMINARY CARD</Text>
                {event.prelimStartTime && !prelimCardStarted && (
                  <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                    {formatTime(event.prelimStartTime)}
                  </Text>
                )}
              </View>
            </View>

            {[...prelimCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
              <FightDisplayCard
                key={fight.id}
                fight={fight}
                onPress={() => handleFightPress(fight)}
                showEvent={false}
                isNextFight={nextFight?.id === fight.id}
                hasLiveFight={hasLiveFight}
                lastCompletedFightTime={lastCompletedFight?.updatedAt}
                index={mainCard.length + index}
              />
            ))}
          </View>
        )}

        {/* Early Prelims */}
        {earlyPrelims.length > 0 && (
          <View style={styles.cardSection}>
            {/* Section Header - Center Only (No Column Headers) */}
            <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
              <View style={styles.sectionHeaderCenter}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>EARLY PRELIMS</Text>
                {event.earlyPrelimStartTime && !earlyPrelimsStarted && (
                  <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                    {formatTime(event.earlyPrelimStartTime)}
                  </Text>
                )}
              </View>
            </View>

            {[...earlyPrelims].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight, index: number) => (
              <FightDisplayCard
                key={fight.id}
                fight={fight}
                onPress={() => handleFightPress(fight)}
                showEvent={false}
                isNextFight={nextFight?.id === fight.id}
                hasLiveFight={hasLiveFight}
                lastCompletedFightTime={lastCompletedFight?.updatedAt}
                index={mainCard.length + prelimCard.length + index}
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
    paddingBottom: 12,
  },
  backIcon: {
    padding: 8,
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  eventName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  eventDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventDate: {
    fontSize: 14,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  liveText: {
    fontSize: 14,
    fontWeight: '600',
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
    position: 'relative',
  },
  sectionHeaderPrelims: {
    paddingVertical: 8,
  },
  sectionHeaderCenter: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    position: 'absolute',
    left: 0,
    right: 0,
    alignSelf: 'center',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionTime: {
    fontSize: 10,
    fontWeight: '600',
  },
  columnHeaders: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginLeft: -11,
    width: 60,
    justifyContent: 'center',
  },
  columnHeadersRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginRight: -11,
    width: 60,
    justifyContent: 'center',
  },
  columnHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
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
