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
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { apiService } from '../../../services/api';
import { useAuth } from '../../../store/AuthContext';
import CompletedFightCard from '../../../components/fight-cards/CompletedFightCard';
import RateFightModal from '../../../components/RateFightModal';
import { EventBannerCard } from '../../../components';

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
}

interface Fight {
  id: string;
  fighter1: any;
  fighter2: any;
  event: any;
  weightClass?: string;
  isTitle: boolean;
  cardSection?: string;
  orderOnCard: number;
  hasStarted: boolean;
  isComplete: boolean;
  winner?: string | null;
  method?: string | null;
  round?: number | null;
  time?: string | null;
  averageRating: number;
  userRating?: number;
  userReview?: string;
  userHypePrediction?: number;
}

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

// Parse event name into two lines
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

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTimeAgo = (dateString: string) => {
  const eventDate = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - eventDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'TODAY';
  }

  if (diffDays === 1) {
    return 'YESTERDAY';
  }

  if (diffDays < 7) {
    return `${diffDays} DAYS AGO`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) {
    return '1 WEEK AGO';
  }

  if (diffWeeks < 4) {
    return `${diffWeeks} WEEKS AGO`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) {
    return '1 MONTH AGO';
  }

  if (diffMonths < 12) {
    return `${diffMonths} MONTHS AGO`;
  }

  const diffYears = Math.floor(diffDays / 365);
  if (diffYears === 1) {
    return '1 YEAR AGO';
  }

  return `${diffYears} YEARS AGO`;
};

// Event Section Component - shows event banner + all fights inline
function EventSection({ event }: { event: Event }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);

  // Fetch fights for this specific event
  const { data: fightsData, isLoading: fightsLoading } = useQuery({
    queryKey: ['eventFights', event.id, isAuthenticated],
    queryFn: async () => {
      const response = await apiService.getFights({
        eventId: event.id,
        includeUserData: isAuthenticated,
        limit: 50,
      });
      // Sort fights by orderOnCard (highest first for reverse chronological order)
      response.fights.sort((a: Fight, b: Fight) => b.orderOnCard - a.orderOnCard);
      return response;
    },
    staleTime: 5 * 60 * 1000,
  });

  const fights = fightsData?.fights || [];

  // Categorize fights by card section
  const mainCard = fights.filter((f: Fight) => f.cardSection === 'Main Card');
  const prelims = fights.filter((f: Fight) => f.cardSection === 'Preliminary Card');
  const earlyPrelims = fights.filter((f: Fight) => f.cardSection === 'Early Prelims');

  // If no fights have card sections (older events), show all fights as one section
  const allFights = mainCard.length === 0 && prelims.length === 0 && earlyPrelims.length === 0 ? fights : [];

  const { line1, line2 } = parseEventName(event.name);

  const handleFightPress = (fight: Fight) => {
    setSelectedFight(fight);
    setRatingModalVisible(true);
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.eventSection}>
      {/* Event Header with Banner and Info */}
      <EventBannerCard
        event={event}
        statusBadge={{
          text: formatTimeAgo(event.date),
          backgroundColor: colors.textSecondary,
        }}
        showLocation={true}
      />

      {/* Fights Container */}
      <View style={styles.fightsContainer}>
        {fightsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading fights...</Text>
          </View>
        ) : (
          <>
            {/* All Fights (for events without card sections) */}
            {allFights.length > 0 && (
              <View style={styles.cardSection}>
                {allFights.map((fight: Fight) => (
                  <CompletedFightCard
                    key={fight.id}
                    fight={fight}
                    onPress={handleFightPress}
                    showEvent={false}
                  />
                ))}
              </View>
            )}

            {/* Main Card */}
            {mainCard.length > 0 && (
              <View style={styles.cardSection}>
                <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
                  MAIN CARD
                </Text>
                {mainCard.map((fight: Fight) => (
                  <CompletedFightCard
                    key={fight.id}
                    fight={fight}
                    onPress={handleFightPress}
                    showEvent={false}
                  />
                ))}
              </View>
            )}

            {/* Preliminary Card */}
            {prelims.length > 0 && (
              <View style={styles.cardSection}>
                <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
                  PRELIMINARY CARD
                </Text>
                {prelims.map((fight: Fight) => (
                  <CompletedFightCard
                    key={fight.id}
                    fight={fight}
                    onPress={handleFightPress}
                    showEvent={false}
                  />
                ))}
              </View>
            )}

            {/* Early Prelims */}
            {earlyPrelims.length > 0 && (
              <View style={styles.cardSection}>
                <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
                  EARLY PRELIMS
                </Text>
                {earlyPrelims.map((fight: Fight) => (
                  <CompletedFightCard
                    key={fight.id}
                    fight={fight}
                    onPress={handleFightPress}
                    showEvent={false}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </View>

      {/* Rate Fight Modal */}
      {selectedFight && (
        <RateFightModal
          visible={ratingModalVisible}
          fight={selectedFight}
          onClose={() => {
            setRatingModalVisible(false);
            setSelectedFight(null);
          }}
        />
      )}
    </View>
  );
}

export default function PastEventsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Fetch all events
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiService.getEvents(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const allEvents = eventsData?.events || [];

  // Filter and sort past events (most recent first)
  const pastEvents = allEvents
    .filter((event: Event) => event.isComplete)
    .sort((a: Event, b: Event) => {
      // Most recent first
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  const styles = createStyles(colors);

  if (eventsLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (pastEvents.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.centerContainer}>
          <Text style={[styles.noEventsText, { color: colors.textSecondary }]}>
            No past events
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
        {pastEvents.map((event: Event) => (
          <EventSection key={event.id} event={event} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    paddingVertical: 0,
  },
  centerContainer: {
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
    marginBottom: 8,
  },
  eventBanner: {
    width: '100%',
    height: 200,
  },
  eventInfo: {
    padding: 16,
  },
  eventName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
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
  fightsContainer: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  cardSection: {
    marginTop: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    marginLeft: 4,
  },
});
