import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';
import { apiService } from '../../services/api';
import { EventCard } from '../../components';


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
  mainStartTime?: string | null;
}


export default function EventsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { accessToken } = useAuth();

  // Animated value for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Fetch events from API
  const { data: eventsData, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiService.getEvents(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const allEvents = eventsData?.events || [];

  // Filter events based on current date and status
  const now = new Date();
  const liveEvents = allEvents
    .filter((e: any) => e.hasStarted && !e.isComplete)
    .sort((a: any, b: any) => {
      // Sort UFC events first, then by date
      const aIsUFC = a.promotion?.toUpperCase() === 'UFC';
      const bIsUFC = b.promotion?.toUpperCase() === 'UFC';
      if (aIsUFC && !bIsUFC) return -1;
      if (!aIsUFC && bIsUFC) return 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  const upcomingEvents = allEvents
    .filter((e: any) => !e.hasStarted && !e.isComplete && new Date(e.date) >= now)
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Sort ascending (soonest first)
  const pastEvents = allEvents
    .filter((e: any) => {
      // Exclude live events from past
      if (e.hasStarted && !e.isComplete) return false;
      // Include if complete OR past date
      return e.isComplete || new Date(e.date) < now;
    })
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort descending (most recent first)

  const hasLiveEvents = liveEvents.length > 0;

  // Set initial tab based on whether there are live events
  const [selectedTab, setSelectedTab] = useState<'upcoming' | 'live' | 'past'>(
    hasLiveEvents ? 'live' : 'upcoming'
  );

  // Start pulsing animation for live tab
  useEffect(() => {
    if (hasLiveEvents) {
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
  }, [hasLiveEvents, pulseAnim]);

  // Update selected tab when live events appear/disappear
  useEffect(() => {
    if (hasLiveEvents && selectedTab === 'upcoming') {
      setSelectedTab('live');
    }
  }, [hasLiveEvents]);

  // Filter events based on selected tab
  const events = selectedTab === 'past'
    ? pastEvents
    : selectedTab === 'live'
    ? liveEvents
    : upcomingEvents;



  const renderEventCard = ({ item: event }: { item: Event }) => (
    <EventCard
      event={event}
      showTime={selectedTab === 'upcoming' || selectedTab === 'live'}
    />
  );

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === 'upcoming' && styles.activeTab,
            { borderColor: colors.border },
            selectedTab === 'upcoming' && { backgroundColor: colors.primary }
          ]}
          onPress={() => setSelectedTab('upcoming')}
        >
          <Text style={[
            styles.tabText,
            { color: selectedTab === 'upcoming' ? colors.textOnAccent : colors.textSecondary }
          ]}>
            Upcoming
          </Text>
        </TouchableOpacity>
        {hasLiveEvents && (
          <TouchableOpacity
            style={[
              styles.tab,
              selectedTab === 'live' && styles.activeTab,
              { borderColor: colors.border },
              selectedTab === 'live' && { backgroundColor: colors.primary }
            ]}
            onPress={() => setSelectedTab('live')}
          >
            <View style={styles.liveTabContent}>
              <Animated.View style={[
                styles.liveDot,
                {
                  backgroundColor: colors.danger,
                  opacity: pulseAnim
                }
              ]} />
              <Text style={[
                styles.tabText,
                { color: colors.danger }
              ]}>
                Live
              </Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === 'past' && styles.activeTab,
            { borderColor: colors.border },
            selectedTab === 'past' && { backgroundColor: colors.primary }
          ]}
          onPress={() => setSelectedTab('past')}
        >
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === 'past' ? colors.textOnAccent : colors.textSecondary }
            ]}
            numberOfLines={1}
          >
            Past
          </Text>
        </TouchableOpacity>
      </View>

      {/* Events List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={events || []}
          keyExtractor={(item) => item.id}
          renderItem={renderEventCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabContainer: {
    flexDirection: 'row',
    margin: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  liveTabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
});