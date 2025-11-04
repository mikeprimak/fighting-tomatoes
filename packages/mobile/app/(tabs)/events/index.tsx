import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Image,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { FightDisplayCard, EventBannerCard } from '../../../components';
import { useAuth } from '../../../store/AuthContext';

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

export default function UpcomingEventsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Fetch all events
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiService.getEvents(),
    staleTime: 5 * 60 * 1000,
  });

  const allEvents = eventsData?.events || [];

  // Filter and sort upcoming events
  const upcomingEvents = allEvents
    .filter((event: Event) => !event.isComplete)
    .sort((a: Event, b: Event) => {
      const aIsLive = a.hasStarted && !a.isComplete;
      const bIsLive = b.hasStarted && !b.isComplete;
      if (aIsLive && !bIsLive) return -1;
      if (!aIsLive && bIsLive) return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

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
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  const formatTimeUntil = (dateString: string) => {
    const eventDate = new Date(dateString);
    const now = new Date();

    // Get calendar dates (ignoring time)
    const eventCalendarDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    const todayCalendarDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate difference in calendar days
    const diffTime = eventCalendarDate.getTime() - todayCalendarDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    // If it's today, show hours remaining
    if (diffDays === 0) {
      const hoursUntil = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      if (hoursUntil <= 0) {
        return 'STARTING SOON';
      }
      if (hoursUntil === 1) {
        return 'IN 1 HOUR';
      }
      return `IN ${hoursUntil} HOURS`;
    }

    if (diffDays === 1) {
      return 'TOMORROW';
    }

    if (diffDays < 7) {
      return `IN ${diffDays} DAYS`;
    }

    const diffWeeks = Math.round(diffDays / 7);
    if (diffWeeks === 1) {
      return 'IN 1 WEEK';
    }

    if (diffWeeks < 4) {
      return `IN ${diffWeeks} WEEKS`;
    }

    const diffMonths = Math.round(diffDays / 30);
    if (diffMonths === 1) {
      return 'IN 1 MONTH';
    }

    if (diffMonths < 12) {
      return `IN ${diffMonths} MONTHS`;
    }

    const diffYears = Math.round(diffDays / 365);
    if (diffYears === 1) {
      return 'IN 1 YEAR';
    }

    return `IN ${diffYears} YEARS`;
  };

  const parseEventName = (eventName: string) => {
    const colonMatch = eventName.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch) {
      return {
        line1: colonMatch[1].trim(),
        line2: colonMatch[2].replace(/\./g, '').trim(),
      };
    }

    const fightNightMatch = eventName.match(/^(UFC Fight Night)\s+(.+)$/i);
    if (fightNightMatch) {
      return {
        line1: fightNightMatch[1],
        line2: fightNightMatch[2].replace(/\./g, '').trim(),
      };
    }

    const numberedMatch = eventName.match(/^(UFC\s+\d+)\s*(.*)$/i);
    if (numberedMatch) {
      return {
        line1: numberedMatch[1],
        line2: numberedMatch[2].replace(/\./g, '').trim() || '',
      };
    }

    return {
      line1: eventName,
      line2: '',
    };
  };

  const handleFightPress = (fight: Fight) => {
    // Navigate to fight detail screen
    router.push(`/fight/${fight.id}`);
  };

  const styles = createStyles(colors);

  if (eventsLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (upcomingEvents.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>
            No upcoming events
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {upcomingEvents.map((event: Event, index: number) => (
          <EventSection
            key={event.id}
            event={event}
            colors={colors}
            isAuthenticated={isAuthenticated}
            onFightPress={handleFightPress}
            parseEventName={parseEventName}
            formatDate={formatDate}
            formatTime={formatTime}
            formatTimeUntil={formatTimeUntil}
            isFirstEvent={index === 0}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// Event Section Component - Shows banner + all fights for one event
function EventSection({
  event,
  colors,
  isAuthenticated,
  onFightPress,
  parseEventName,
  formatDate,
  formatTime,
  formatTimeUntil,
  isFirstEvent,
}: {
  event: Event;
  colors: any;
  isAuthenticated: boolean;
  onFightPress: (fight: Fight) => void;
  parseEventName: (name: string) => { line1: string; line2: string };
  formatDate: (date: string) => string;
  formatTime: (date: string) => string;
  formatTimeUntil: (date: string) => string;
  isFirstEvent: boolean;
}) {
  const { line1, line2 } = parseEventName(event.name);
  const isLive = event.hasStarted && !event.isComplete;

  // Fetch fights for this event
  const { data: fightsData, isLoading: fightsLoading } = useQuery({
    queryKey: ['eventFights', event.id, isAuthenticated],
    queryFn: async () => {
      const response = await apiService.getFights({
        eventId: event.id,
        includeUserData: isAuthenticated,
        limit: 50,
      });
      response.fights.sort((a: any, b: any) => b.orderOnCard - a.orderOnCard);
      return response;
    },
  });

  const fights = fightsData?.fights || [];

  // Group fights by card section
  const hasEarlyPrelims = !!event.earlyPrelimStartTime;
  const mainCard = fights.filter((f: Fight) => f.orderOnCard <= 5);
  const prelimCard = hasEarlyPrelims
    ? fights.filter((f: Fight) => f.orderOnCard > 5 && f.orderOnCard <= 9)
    : fights.filter((f: Fight) => f.orderOnCard > 5);
  const earlyPrelims = hasEarlyPrelims ? fights.filter((f: Fight) => f.orderOnCard > 9) : [];

  // Find next fight and last completed fight
  const nextFight = fights
    .filter((f: Fight) => !f.hasStarted && !f.isComplete)
    .sort((a, b) => b.orderOnCard - a.orderOnCard)[0];

  const lastCompletedFight = fights
    .filter((f: Fight) => f.isComplete)
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime;
    })[0];

  const hasLiveFight = fights.some((f: Fight) => f.hasStarted && !f.isComplete);

  const styles = createStyles(colors);

  return (
    <View style={styles.eventSection}>
      {/* Event Banner and Info */}
      <EventBannerCard
        event={event}
        statusBadge={{
          text: isLive ? 'LIVE NOW' : formatTimeUntil(event.date),
          backgroundColor: isLive ? colors.danger : '#F5C518',
          textColor: isLive ? '#FFFFFF' : '#000000',
        }}
      />

      {/* Fights List */}
      {fightsLoading ? (
        <View style={styles.fightsLoadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <View style={styles.fightsContainer}>
          {/* Main Card */}
          {mainCard.length > 0 && (
            <View style={styles.cardSection}>
              <View style={styles.sectionHeader}>
                {/* Left Column Header - ALL / HYPE */}
                <View style={styles.columnHeaders}>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    ALL
                  </Text>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    HYPE
                  </Text>
                </View>

                {/* Center - Title and Time stacked vertically */}
                <View style={styles.sectionHeaderCenter}>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                    MAIN CARD
                  </Text>
                  {event.mainStartTime && (
                    <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                      {formatTime(event.mainStartTime)}
                    </Text>
                  )}
                </View>

                {/* Right Column Header - MY / HYPE */}
                <View style={styles.columnHeadersRight}>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    MY
                  </Text>
                  <Text style={[styles.columnHeaderText, { color: colors.textSecondary }]}>
                    HYPE
                  </Text>
                </View>
              </View>

              {[...mainCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight) => (
                <FightDisplayCard
                  key={fight.id}
                  fight={fight}
                  onPress={() => onFightPress(fight)}
                  showEvent={false}
                  isNextFight={nextFight?.id === fight.id}
                  hasLiveFight={hasLiveFight}
                  lastCompletedFightTime={lastCompletedFight?.updatedAt}
                />
              ))}
            </View>
          )}

          {/* Preliminary Card */}
          {prelimCard.length > 0 && (
            <View style={styles.cardSection}>
              <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
                {/* Center - Title and Time stacked vertically */}
                <View style={styles.sectionHeaderCenter}>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                    PRELIMINARY CARD
                  </Text>
                  {event.prelimStartTime && (
                    <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                      {formatTime(event.prelimStartTime)}
                    </Text>
                  )}
                </View>
              </View>
              {[...prelimCard].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight) => (
                <FightDisplayCard
                  key={fight.id}
                  fight={fight}
                  onPress={() => onFightPress(fight)}
                  showEvent={false}
                  isNextFight={nextFight?.id === fight.id}
                  hasLiveFight={hasLiveFight}
                  lastCompletedFightTime={lastCompletedFight?.updatedAt}
                />
              ))}
            </View>
          )}

          {/* Early Prelims */}
          {earlyPrelims.length > 0 && (
            <View style={styles.cardSection}>
              <View style={[styles.sectionHeader, styles.sectionHeaderPrelims]}>
                {/* Center - Title and Time stacked vertically */}
                <View style={styles.sectionHeaderCenter}>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                    EARLY PRELIMS
                  </Text>
                  {event.earlyPrelimStartTime && (
                    <Text style={[styles.sectionTime, { color: colors.textSecondary }]}>
                      {formatTime(event.earlyPrelimStartTime)}
                    </Text>
                  )}
                </View>
              </View>
              {[...earlyPrelims].sort((a, b) => a.orderOnCard - b.orderOnCard).map((fight: Fight) => (
                <FightDisplayCard
                  key={fight.id}
                  fight={fight}
                  onPress={() => onFightPress(fight)}
                  showEvent={false}
                  isNextFight={nextFight?.id === fight.id}
                  hasLiveFight={hasLiveFight}
                  lastCompletedFightTime={lastCompletedFight?.updatedAt}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 20,
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
  noEventsText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  eventSection: {
    marginBottom: 32,
  },
  eventHeader: {
    overflow: 'hidden',
  },
  eventBanner: {
    width: '100%',
    height: 200,
  },
  eventInfo: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  eventName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
    flexShrink: 1,
  },
  eventSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    flexShrink: 1,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  eventDate: {
    fontSize: 14,
  },
  eventLocation: {
    fontSize: 13,
    marginTop: 4,
  },
  fightsLoadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  fightsContainer: {
    marginTop: 8,
  },
  cardSection: {
    marginTop: 8,
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
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto', // Push to the right when no left content
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
    marginLeft: -11, // Offset the sectionHeader's marginHorizontal to align with heatmap squares
    width: 40, // Match width of heatmap square
    justifyContent: 'center', // Center text within the column
  },
  columnHeadersRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    marginRight: -11, // Offset the sectionHeader's marginHorizontal to align with heatmap squares
    width: 40, // Match width of heatmap square
    justifyContent: 'center', // Center text within the column
  },
  columnHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
