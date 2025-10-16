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
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { FightDisplayCard, RateFightModal, PredictionModal, EventEngagementSummary } from '../../../components';
import { useAuth } from '../../../store/AuthContext';
import { FontAwesome } from '@expo/vector-icons';
import { useLiveEventPolling } from '../../../hooks/useLiveEventPolling';

interface Event {
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Placeholder image selection logic
const getPlaceholderImage = (eventId: string) => {
  const images = [
    require('../../../assets/events/event-banner-1.jpg'),
    require('../../../assets/events/event-banner-2.jpg'),
    require('../../../assets/events/event-banner-3.jpg'),
  ];

  const lastCharCode = eventId.charCodeAt(eventId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export default function EventsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);

  // Modal state
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [recentlyRatedFightId, setRecentlyRatedFightId] = useState<string | null>(null);
  const [recentlyPredictedFightId, setRecentlyPredictedFightId] = useState<string | null>(null);
  const [currentEventIndex, setCurrentEventIndex] = useState<number | null>(null);
  const [hasBlinkAnimated, setHasBlinkAnimated] = useState(false);

  // Pulsing animation for live indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Chevron blink animation
  const chevronOpacity = useRef(new Animated.Value(1)).current;

  // Fetch all events
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiService.getEvents(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const allEvents = eventsData?.events || [];

  // Sort all events chronologically (past → upcoming → future)
  // Put live events at the front
  const sortedEvents = [...allEvents].sort((a: Event, b: Event) => {
    // Live events first
    const aIsLive = a.hasStarted && !a.isComplete;
    const bIsLive = b.hasStarted && !b.isComplete;
    if (aIsLive && !bIsLive) return -1;
    if (!aIsLive && bIsLive) return 1;

    // Then sort by date
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  // Calculate the default event index using useMemo (synchronous, no delay)
  const defaultEventIndex = React.useMemo(() => {
    if (sortedEvents.length === 0) return 0;

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));

    // First, check for live events
    const liveEventIndex = sortedEvents.findIndex((e: Event) => e.hasStarted && !e.isComplete);
    if (liveEventIndex !== -1) {
      return liveEventIndex;
    }

    // Second, check for events that occurred within the past 2 days
    const recentEvents = sortedEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => {
        const eventDate = new Date(event.date);
        return event.isComplete && eventDate >= twoDaysAgo && eventDate <= now;
      });

    if (recentEvents.length > 0) {
      // Sort by date descending to get the most recent one
      recentEvents.sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime());
      return recentEvents[0].index;
    }

    // Third, find the next upcoming event (closest future event to today)
    const upcomingEvents = sortedEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => !event.hasStarted && !event.isComplete && new Date(event.date) >= now);

    if (upcomingEvents.length > 0) {
      // Sort by date ascending to get the closest upcoming event
      upcomingEvents.sort((a, b) => new Date(a.event.date).getTime() - new Date(b.event.date).getTime());
      return upcomingEvents[0].index;
    }

    // Fallback: show the most recent past event (regardless of how long ago)
    const pastEvents = sortedEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.isComplete);

    if (pastEvents.length > 0) {
      pastEvents.sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime());
      return pastEvents[0].index;
    }

    return 0;
  }, [sortedEvents]);

  // Set current event index when defaultEventIndex is calculated
  useEffect(() => {
    if (currentEventIndex === null && sortedEvents.length > 0) {
      setCurrentEventIndex(defaultEventIndex);
    }
  }, [defaultEventIndex, currentEventIndex, sortedEvents.length]);

  // Scroll to initial event when data loads
  useEffect(() => {
    if (sortedEvents.length > 0 && currentEventIndex !== null && currentEventIndex >= 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: currentEventIndex,
          animated: false,
        });
      }, 100);
    }
  }, [sortedEvents.length]);

  const currentEvent = sortedEvents[currentEventIndex];

  // Fetch fights for current event
  const { data: fightsData, isLoading: fightsLoading } = useQuery({
    queryKey: ['eventFights', currentEvent?.id, isAuthenticated],
    queryFn: async () => {
      if (!currentEvent?.id) return { fights: [] };

      const response = await apiService.getFights({
        eventId: currentEvent.id,
        includeUserData: isAuthenticated,
        limit: 50
      });

      // Sort fights by orderOnCard descending (main event first)
      response.fights.sort((a: any, b: any) => b.orderOnCard - a.orderOnCard);
      return response;
    },
    enabled: !!currentEvent?.id,
  });

  const fights = fightsData?.fights || [];

  // Fetch engagement data for current event (only if authenticated)
  const { data: engagementData, isLoading: engagementLoading, error: engagementError } = useQuery({
    queryKey: ['eventEngagement', currentEvent?.id],
    queryFn: async () => {
      if (!currentEvent?.id || !isAuthenticated) return null;
      console.log('Fetching engagement for event:', currentEvent.id);
      const result = await apiService.getEventEngagement(currentEvent.id);
      console.log('Engagement data received:', result);
      return result;
    },
    enabled: !!currentEvent?.id && isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Debug logging
  React.useEffect(() => {
    if (engagementData) {
      console.log('Engagement data in component:', engagementData);
    }
    if (engagementError) {
      console.error('Engagement fetch error:', engagementError);
    }
  }, [engagementData, engagementError]);

  // Helper to check if event is currently live
  const isEventLive = (event: Event | undefined) => {
    if (!event || event.isComplete) return false;
    if (event.hasStarted && !event.isComplete) return true;

    const now = new Date();
    const earliestTime = event.prelimStartTime || event.mainStartTime;
    if (!earliestTime) return false;

    const startTime = new Date(earliestTime);
    return now >= startTime && !event.isComplete;
  };

  const eventIsLive = isEventLive(currentEvent);

  // Enable live polling when event is live
  useLiveEventPolling({
    eventId: currentEvent?.id || '',
    isLive: eventIsLive,
    intervalMs: 10000,
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

  // Blink chevrons twice on initial load, then hide
  useEffect(() => {
    if (!hasBlinkAnimated && sortedEvents.length > 0) {
      // Start hidden
      chevronOpacity.setValue(0);

      // Wait a bit for screen to fully load, then blink twice and disappear
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(chevronOpacity, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(chevronOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(chevronOpacity, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(chevronOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setHasBlinkAnimated(true);
        });
      }, 600);
    }
  }, [hasBlinkAnimated, sortedEvents.length, chevronOpacity]);

  // Reset animation state when component unmounts (user navigates away)
  useEffect(() => {
    return () => {
      setHasBlinkAnimated(false);
      chevronOpacity.setValue(0);
    };
  }, [chevronOpacity]);

  const openRatingModal = async (fight: Fight) => {
    try {
      const hasUserData = fight.userRating || fight.userReview || (fight.userTags && fight.userTags.length > 0);

      if (user?.id && !hasUserData) {
        const { fight: detailedFight } = await apiService.getFight(fight.id);
        const enrichedFight = {
          ...fight,
          userRating: detailedFight.userRating,
          userReview: detailedFight.userReview,
          userTags: detailedFight.userTags
        };
        setSelectedFight(enrichedFight);
      } else {
        setSelectedFight(fight);
      }

      setShowRatingModal(true);
    } catch (error) {
      console.error('Error fetching detailed fight data:', error);
      setSelectedFight(fight);
      setShowRatingModal(true);
    }
  };

  const openPredictionModal = (fight: Fight) => {
    setSelectedFight(fight);
    setShowPredictionModal(true);
  };

  const handleFightPress = (fight: Fight) => {
    if (fight.hasStarted || fight.isComplete) {
      openRatingModal(fight);
    } else {
      openPredictionModal(fight);
    }
  };

  const closeModal = () => {
    setSelectedFight(null);
    setShowRatingModal(false);
    setShowPredictionModal(false);
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

  const formatEventStatus = (event: Event) => {
    const eventDate = new Date(event.date);
    const now = new Date();
    const isPast = eventDate < now;

    const formattedDate = formatDate(event.date);

    if (isPast) {
      return `Complete: ${formattedDate}`;
    } else {
      return `Upcoming: ${formattedDate}`;
    }
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

  const getDisplayTime = (event: Event | undefined) => {
    if (!event) return null;
    if (event.mainStartTime) {
      return formatTime(event.mainStartTime);
    }
    return null;
  };

  // Parse event name into two lines: organization/event type and fighters
  const parseEventName = (eventName: string) => {
    // Example: "UFC Fight Night Ridder vs. Allen" → ["UFC Fight Night", "Ridder vs Allen"]
    // Example: "UFC 308: Topuria vs. Holloway" → ["UFC 308", "Topuria vs Holloway"]

    const colonMatch = eventName.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch) {
      return {
        line1: colonMatch[1].trim(),
        line2: colonMatch[2].replace(/\./g, '').trim(),
      };
    }

    // Match "UFC Fight Night" followed by fighter names
    const fightNightMatch = eventName.match(/^(UFC Fight Night)\s+(.+)$/i);
    if (fightNightMatch) {
      return {
        line1: fightNightMatch[1],
        line2: fightNightMatch[2].replace(/\./g, '').trim(),
      };
    }

    // Match numbered events like "UFC 308" followed by optional subtitle
    const numberedMatch = eventName.match(/^(UFC\s+\d+)\s*(.*)$/i);
    if (numberedMatch) {
      return {
        line1: numberedMatch[1],
        line2: numberedMatch[2].replace(/\./g, '').trim() || '',
      };
    }

    // Fallback: return full name on line 1
    return {
      line1: eventName,
      line2: '',
    };
  };

  // Check if any fight is currently live
  const hasLiveFight = fights.some((f: Fight) => f.hasStarted && !f.isComplete);

  // Determine the next fight to start
  const nextFight = fights
    .filter((f: Fight) => !f.hasStarted && !f.isComplete)
    .sort((a, b) => b.orderOnCard - a.orderOnCard)[0];

  // Find the most recently completed fight
  const lastCompletedFight = fights
    .filter((f: Fight) => f.isComplete)
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime;
    })[0];

  // Group fights by card section
  // If no early prelim start time, all non-main card fights are prelims
  const hasEarlyPrelims = !!currentEvent?.earlyPrelimStartTime;
  const mainCard = fights.filter((f: Fight) => f.orderOnCard <= 5);
  const prelimCard = hasEarlyPrelims
    ? fights.filter((f: Fight) => f.orderOnCard > 5 && f.orderOnCard <= 9)
    : fights.filter((f: Fight) => f.orderOnCard > 5);
  const earlyPrelims = hasEarlyPrelims
    ? fights.filter((f: Fight) => f.orderOnCard > 9)
    : [];

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentEventIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Create styles at the top so they're available for all renders
  const styles = createStyles(colors);

  const renderEventDetail = ({ item: event, index }: { item: Event; index: number }) => {
    const isCurrentEvent = index === currentEventIndex;
    const prevEvent = index > 0 ? sortedEvents[index - 1] : null;
    const nextEvent = index < sortedEvents.length - 1 ? sortedEvents[index + 1] : null;
    const isLive = isEventLive(event);
    const { line1, line2 } = parseEventName(event?.name || '');

    if (!isCurrentEvent) {
      // Don't render fights for non-current events to save memory
      return (
        <View style={[styles.eventContainer, { width: SCREEN_WIDTH }]}>
          {/* Event Header - always render */}
          <View style={[styles.header, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={styles.headerRow}>
              {/* Previous Event Indicator */}
              {prevEvent && (
                <Animated.View style={[styles.swipeIndicator, { opacity: chevronOpacity }]}>
                  <FontAwesome name="chevron-left" size={16} color={colors.textSecondary} />
                </Animated.View>
              )}

              {/* Current Event */}
              <View style={styles.centerEventContainer}>
                <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={1}>
                  {line1 || 'Loading...'}
                </Text>
                {line2 && (
                  <Text style={[styles.eventSubtitle, { color: colors.text }]} numberOfLines={1}>
                    {line2}
                  </Text>
                )}
                {isLive && (
                  <View style={styles.liveIndicator}>
                    <Animated.View style={[
                      styles.liveDot,
                      { backgroundColor: colors.danger, opacity: pulseAnim }
                    ]} />
                    <Text style={[styles.liveText, { color: colors.danger }]}>Live</Text>
                  </View>
                )}
                <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
                  {formatEventStatus(event)}
                </Text>
              </View>

              {/* Next Event Indicator */}
              {nextEvent && (
                <Animated.View style={[styles.swipeIndicator, { opacity: chevronOpacity }]}>
                  <FontAwesome name="chevron-right" size={16} color={colors.textSecondary} />
                </Animated.View>
              )}
            </View>
          </View>

          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.eventContainer, { width: SCREEN_WIDTH }]}>
        {/* Event Header */}
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          <View style={styles.headerRow}>
            {/* Previous Event Indicator */}
            {prevEvent && (
              <Animated.View style={[styles.swipeIndicator, { opacity: chevronOpacity }]}>
                <FontAwesome name="chevron-left" size={16} color={colors.textSecondary} />
              </Animated.View>
            )}

            {/* Current Event */}
            <View style={styles.centerEventContainer}>
              <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={1}>
                {line1 || 'Loading...'}
              </Text>
              {line2 && (
                <Text style={[styles.eventSubtitle, { color: colors.text }]} numberOfLines={1}>
                  {line2}
                </Text>
              )}
              {isLive && (
                <View style={styles.liveIndicator}>
                  <Animated.View style={[
                    styles.liveDot,
                    { backgroundColor: colors.danger, opacity: pulseAnim }
                  ]} />
                  <Text style={[styles.liveText, { color: colors.danger }]}>Live</Text>
                </View>
              )}
              <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
                {formatEventStatus(event)}
              </Text>
            </View>

            {/* Next Event Indicator */}
            {nextEvent && (
              <Animated.View style={[styles.swipeIndicator, { opacity: chevronOpacity }]}>
                <FontAwesome name="chevron-right" size={16} color={colors.textSecondary} />
              </Animated.View>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Event Banner Image */}
          {event?.id && (
            <Image
              source={event.bannerImage ? { uri: event.bannerImage } : getPlaceholderImage(event.id)}
              style={styles.eventBanner}
              resizeMode="cover"
            />
          )}

          {/* User Engagement Summary */}
          {isAuthenticated && engagementData && (
            <EventEngagementSummary
              totalFights={engagementData.totalFights}
              predictionsCount={engagementData.predictionsCount}
              ratingsCount={engagementData.ratingsCount}
              alertsCount={engagementData.alertsCount}
              averageHype={engagementData.averageHype}
              topHypedFights={engagementData.topHypedFights || []}
            />
          )}

          {/* Main Card */}
          {mainCard.length > 0 && (
            <View style={styles.cardSection}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  MAIN CARD
                </Text>
                {event.mainStartTime && (
                  <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                    {formatTime(event.mainStartTime)}
                  </Text>
                )}
              </View>
              {[...mainCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight) => (
                <FightDisplayCard
                  key={fight.id}
                  fight={fight}
                  onPress={() => handleFightPress(fight)}
                  showEvent={false}
                  isNextFight={nextFight?.id === fight.id}
                  hasLiveFight={hasLiveFight}
                  lastCompletedFightTime={lastCompletedFight?.updatedAt}
                  animateRating={fight.id === recentlyRatedFightId}
                  animatePrediction={fight.id === recentlyPredictedFightId}
                />
              ))}
            </View>
          )}

          {/* Preliminary Card */}
          {prelimCard.length > 0 && (
            <View style={styles.cardSection}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  PRELIMINARY CARD
                </Text>
                {event.prelimStartTime && (
                  <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                    {formatTime(event.prelimStartTime)}
                  </Text>
                )}
              </View>
              {[...prelimCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight) => (
                <FightDisplayCard
                  key={fight.id}
                  fight={fight}
                  onPress={() => handleFightPress(fight)}
                  showEvent={false}
                  isNextFight={nextFight?.id === fight.id}
                  hasLiveFight={hasLiveFight}
                  lastCompletedFightTime={lastCompletedFight?.updatedAt}
                  animateRating={fight.id === recentlyRatedFightId}
                  animatePrediction={fight.id === recentlyPredictedFightId}
                />
              ))}
            </View>
          )}

          {/* Early Prelims */}
          {earlyPrelims.length > 0 && (
            <View style={styles.cardSection}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  EARLY PRELIMS
                </Text>
                {event.earlyPrelimStartTime && (
                  <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                    {formatTime(event.earlyPrelimStartTime)}
                  </Text>
                )}
              </View>
              {[...earlyPrelims].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight) => (
                <FightDisplayCard
                  key={fight.id}
                  fight={fight}
                  onPress={() => handleFightPress(fight)}
                  showEvent={false}
                  isNextFight={nextFight?.id === fight.id}
                  hasLiveFight={hasLiveFight}
                  lastCompletedFightTime={lastCompletedFight?.updatedAt}
                  animateRating={fight.id === recentlyRatedFightId}
                  animatePrediction={fight.id === recentlyPredictedFightId}
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
    );
  };

  if (eventsLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (sortedEvents.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.errorContainer}>
          <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>
            No events available
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show loading while calculating the correct event index
  if (currentEventIndex === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Swipeable Event List */}
      <FlatList
        ref={flatListRef}
        data={sortedEvents}
        renderItem={renderEventDetail}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(data, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        initialScrollIndex={defaultEventIndex}
        onScrollToIndexFailed={(info) => {
          const wait = new Promise((resolve) => setTimeout(resolve, 500));
          wait.then(() => {
            flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
          });
        }}
        directionalLockEnabled={true}
        scrollEventThrottle={16}
      />

      {/* Rating Modal */}
      <RateFightModal
        visible={showRatingModal}
        fight={selectedFight}
        onClose={closeModal}
        queryKey={['eventFights', currentEvent?.id]}
        onSuccess={(type, data) => {
          if (type === 'rating' && data?.fightId && data?.rating) {
            queryClient.invalidateQueries({ queryKey: ['eventEngagement', currentEvent?.id] });
            setTimeout(() => {
              setRecentlyRatedFightId(data.fightId || null);
              setTimeout(() => setRecentlyRatedFightId(null), 1000);
            }, 300);
          }
        }}
      />

      <PredictionModal
        visible={showPredictionModal}
        fight={selectedFight}
        onClose={closeModal}
        onSuccess={(isUpdate, data) => {
          queryClient.invalidateQueries({ queryKey: ['eventFights', currentEvent?.id] });
          queryClient.invalidateQueries({ queryKey: ['eventEngagement', currentEvent?.id] });

          if (data?.fightId && data?.hypeLevel) {
            setTimeout(() => {
              setRecentlyPredictedFightId(data.fightId || null);
              setTimeout(() => setRecentlyPredictedFightId(null), 1000);
            }, 300);
          }
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 8,
    paddingTop: 0,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  swipeIndicator: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerEventContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  eventName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  eventSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  eventDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDate: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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
  eventContainer: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 20,
  },
  eventBanner: {
    width: '100%',
    height: 200,
    marginBottom: 16,
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
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionTime: {
    fontSize: 14,
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
  noEventsText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
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
