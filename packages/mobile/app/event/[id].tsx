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
  Alert,
} from 'react-native';
import { useLocalSearchParams, router, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { FightDisplayCard, ScreenHeader, HowToWatch } from '../../components';
import UpcomingFightModal from '../../components/UpcomingFightModal';
import { useAuth } from '../../store/AuthContext';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { useLiveEventPolling } from '../../hooks/useLiveEventPolling';
import { normalizeEventName } from '../../components/fight-cards/shared/utils';
import { formatEventDate, formatEventTime } from '../../utils/dateFormatters';
import { getDefaultBanner } from '../../utils/defaultBanners';
import { PromotionLogo } from '../../components/PromotionLogo';

interface EventDetails {
  id: string;
  name: string;
  date: string;
  venue?: string;
  location?: string;
  promotion: string;
  eventStatus: string;
  bannerImage?: string | null;
  earlyPrelimStartTime?: string | null;
  prelimStartTime?: string | null;
  mainStartTime?: string | null;
}

type Fight = any;

/**
 * Get banner image source for an event.
 * Priority: event.bannerImage > promotion default > null (styled fallback)
 */
function getBannerSource(event: EventDetails): { uri: string } | any | null {
  if (event.bannerImage) return { uri: event.bannerImage };
  return getDefaultBanner(event.promotion);
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [bannerAspectRatio, setBannerAspectRatio] = useState<number>(16 / 9);

  // Modal state for upcoming fight quick-view
  const [modalFight, setModalFight] = useState<Fight | null>(null);

  // Pulsing animation for live indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Fetch event details
  const { data: eventData, isLoading: eventLoading, error: eventError } = useQuery({
    queryKey: ['event', id],
    queryFn: () => apiService.getEvent(id as string),
    enabled: !!id,
    refetchInterval: 30000,
  });

  // Fetch fights for the event
  const { data: fightsData, isLoading: fightsLoading, error: fightsError } = useQuery({
    queryKey: ['eventFights', id, isAuthenticated],
    queryFn: async () => {
      const response = await apiService.getFights({
        eventId: id as string,
        includeUserData: isAuthenticated,
        limit: 50
      });

      // Sort fights by orderOnCard descending (main event first)
      response.fights.sort((a: any, b: any) => b.orderOnCard - a.orderOnCard);

      return response;
    },
    enabled: !!id,
    refetchInterval: 30000,
  });

  const event = eventData?.event;
  const fights = fightsData?.fights || [];

  // Debug: show alert when fights.length is 0 after loading (temporary debugging)
  useEffect(() => {
    if (event && !fightsLoading && !eventLoading) {
      if (fights.length === 0) {
        Alert.alert(
          `Debug: No Fights`,
          `Promotion: ${event.promotion}\nEvent: ${event.name}\nEvent ID: ${id}\n\nAPI returned 0 fights.`
        );
      }
    }
  }, [event?.id, fightsLoading, eventLoading, fights.length]);

  // Helper to check if event is currently live
  const isEventLive = (event: EventDetails | undefined) => {
    if (!event || event.eventStatus === 'COMPLETED') return false;

    // Primary check: if event status is LIVE
    if (event.eventStatus === 'LIVE') return true;

    // Secondary time-based check for scheduled events
    const now = new Date();
    const earliestTime = event.prelimStartTime || event.mainStartTime;
    if (!earliestTime) return false;

    const startTime = new Date(earliestTime);
    return now >= startTime && event.eventStatus !== 'COMPLETED';
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
    // Only UpcomingFightCard delegates its tap here, so this always opens the
    // upcoming quick-view modal. LiveFightCard and CompletedFightCard manage
    // their own modal internally and never call onPress.
    // Attach the parent event so the modal can branch on live-tracking and
    // target the right query cache (the fights endpoint doesn't nest it).
    setModalFight(event ? ({ ...fight, event } as Fight) : fight);
  };

  const handleBannerLoad = (e: any) => {
    const { width, height } = e.nativeEvent.source;
    if (width && height) {
      setBannerAspectRatio(width / height);
    }
  };

  const formatDate = (dateString: string) => formatEventDate(dateString, { year: true });
  const formatTime = (dateString: string) => formatEventTime(dateString);

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
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
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
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
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
  const hasLiveFight = fights.some((f: Fight) => f.fightStatus === 'LIVE');

  // Determine the next fight to start (highest orderOnCard that hasn't started)
  // Fights execute in reverse order: early prelims (high numbers) → prelims → main card (low numbers)
  // Only show "Up Next" for events that have actually started. Gate on the event
  // being live (status LIVE or its start time has passed) or a fight being LIVE —
  // NOT on any COMPLETED fight existing, because a stray/phantom completed fight
  // bleeding onto a still-upcoming event would otherwise flip the whole card into
  // "up next" days before the event (see RAF 10, 2026-06-08).
  const eventHasStarted = eventIsLive || hasLiveFight;
  const nextFight = eventHasStarted
    ? fights
        .filter((f: Fight) => f.fightStatus === 'UPCOMING')
        .sort((a, b) => b.orderOnCard - a.orderOnCard)[0]
    : undefined;

  // Find the most recently completed fight (for timing "Up next..." messages)
  const lastCompletedFight = fights
    .filter((f: Fight) => f.fightStatus === 'COMPLETED')
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime; // Most recent first
    })[0];

  // Group fights by card section using cardType from scrapers
  // Strategy: Be inclusive - only explicitly filter prelims/early prelims,
  // everything else goes to main card (including unrecognized values)

  const isPrelims = (cardType: string | null | undefined) => {
    if (!cardType) return false;
    const lower = cardType.toLowerCase().trim();
    // Match: prelims, preliminary, undercard (but not early prelims)
    return (lower.includes('prelim') && !lower.includes('early')) ||
           lower === 'undercard' ||
           lower === 'under card';
  };

  const isEarlyPrelims = (cardType: string | null | undefined) => {
    if (!cardType) return false;
    const lower = cardType.toLowerCase().trim();
    return lower.includes('early prelim') || lower.includes('early-prelim');
  };

  // Early prelims first (most specific match)
  const earlyPrelims = fights.filter((f: Fight) => {
    if (f.cardType) return isEarlyPrelims(f.cardType);
    // Legacy fallback
    return f.orderOnCard > 13;
  });

  // Prelims second
  const prelimCard = fights.filter((f: Fight) => {
    if (f.cardType) return isPrelims(f.cardType);
    // Legacy fallback
    return !f.cardType && f.orderOnCard > 6 && f.orderOnCard <= 13;
  });

  // Main card: everything else (most inclusive)
  const mainCard = fights.filter((f: Fight) => {
    if (f.cardType) {
      // Has cardType - include if NOT prelims or early prelims
      return !isPrelims(f.cardType) && !isEarlyPrelims(f.cardType);
    }
    // Legacy fallback - no cardType means use orderOnCard
    return f.orderOnCard <= 6;
  });


  // Helper function to check if any fight in a card section has started
  const hasCardSectionStarted = (fights: Fight[]) => {
    return fights.some((f: Fight) => f.fightStatus !== 'UPCOMING');
  };

  // Check if each card section has started
  const mainCardStarted = hasCardSectionStarted(mainCard);
  const prelimCardStarted = hasCardSectionStarted(prelimCard);
  const earlyPrelimsStarted = hasCardSectionStarted(earlyPrelims);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

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
            {event ? normalizeEventName(event.name, event.promotion) : 'Loading...'}
          </Text>
          <View style={styles.eventDateRow}>
            {event && event.eventStatus !== 'COMPLETED' && eventIsLive ? (
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
                {event && event.eventStatus !== 'COMPLETED' && getDisplayTime(event) && (
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
          getBannerSource(event) ? (
            <Image
              source={getBannerSource(event)!}
              style={[styles.eventBanner, { aspectRatio: bannerAspectRatio }]}
              resizeMode="cover"
              onLoad={handleBannerLoad}
            />
          ) : (
            <View style={[styles.eventBanner, styles.placeholderBanner]}>
              <PromotionLogo promotion={event.promotion} size={72} />
            </View>
          )
        )}

        {/* How to Watch — whole event */}
        {event?.id && (
          <View style={styles.howToWatchWrapper}>
            <HowToWatch eventId={event.id} />
          </View>
        )}

        {/* Main Card */}
        {mainCard.length > 0 && (
          <View style={styles.cardSection}>
            {event?.id && (
              <View style={styles.howToWatchWrapper}>
                <HowToWatch
                  eventId={event.id}
                  section="MAIN_CARD"
                  label="MAIN CARD"
                  time={event.mainStartTime ? formatTime(event.mainStartTime) : undefined}
                />
              </View>
            )}
            {/* Column headers aligned over the aggregate (left) and user (right)
                score columns of each FightDisplayCard. Hype for upcoming events,
                rating once the event is completed. */}
            <View style={styles.colHeaderRow}>
              <View style={styles.colHeaderCol}>
                <Text style={[styles.colHeaderText, { color: colors.textSecondary }]}>ALL</Text>
                <Text style={[styles.colHeaderText, { color: colors.textSecondary }]}>
                  {event?.eventStatus === 'COMPLETED' ? 'RATING' : 'HYPE'}
                </Text>
              </View>
              <View style={styles.colHeaderCol}>
                <Text style={[styles.colHeaderText, { color: colors.textSecondary }]}>MY</Text>
                <Text style={[styles.colHeaderText, { color: colors.textSecondary }]}>
                  {event?.eventStatus === 'COMPLETED' ? 'RATING' : 'HYPE'}
                </Text>
              </View>
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
            {event?.id && (
              <View style={styles.howToWatchWrapper}>
                <HowToWatch
                  eventId={event.id}
                  section="PRELIMS"
                  label="PRELIMS"
                  time={event.prelimStartTime ? formatTime(event.prelimStartTime) : undefined}
                />
              </View>
            )}
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
            {event?.id && (
              <View style={styles.howToWatchWrapper}>
                <HowToWatch
                  eventId={event.id}
                  section="EARLY_PRELIMS"
                  label="EARLY PRELIMS"
                  time={event.earlyPrelimStartTime ? formatTime(event.earlyPrelimStartTime) : undefined}
                />
              </View>
            )}
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

      {/* Upcoming fight quick-view modal */}
      <UpcomingFightModal
        visible={!!modalFight}
        fight={modalFight}
        onClose={() => setModalFight(null)}
        showNotificationBell={(event as any)?.notificationsAllowed === true}
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
    marginBottom: 0,
  },
  placeholderBanner: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    aspectRatio: 16 / 9,
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
  howToWatchWrapper: {
    paddingHorizontal: 12,
  },
  cardSection: {
    marginTop: 0,
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
    paddingTop: 8,
    paddingBottom: 9,
    marginTop: 16,
    marginBottom: 13,
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
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionTime: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Column-header row over the fight cards. Cards are flush to the screen edges
  // with a 48px score square at each edge, so a space-between row of 48px-wide
  // centered columns lines the labels up over those squares.
  colHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
    marginBottom: 4,
  },
  colHeaderCol: {
    width: 48,
    alignItems: 'center',
  },
  colHeaderText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 11,
  },
  columnHeaders: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginLeft: -16,
    width: 60,
    justifyContent: 'center',
  },
  columnHeadersRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginRight: -18,
    width: 60,
    justifyContent: 'center',
  },
  columnHeaderText: {
    fontSize: 11,
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
