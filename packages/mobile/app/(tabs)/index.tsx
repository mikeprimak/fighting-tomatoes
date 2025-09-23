import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../store/AuthContext';

interface Organization {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string;
}

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  photoUrl?: string;
}

interface Fight {
  id: string;
  fightOrder: number;
  weightClass?: string;
  rounds: number;
  isTitle: boolean;
  fighterA: Fighter;
  fighterB: Fighter;
  averageRating?: number;
  totalRatings?: number;
}

interface Event {
  id: string;
  name: string;
  shortName: string;
  date: string;
  venue?: string;
  location?: string;
  posterUrl?: string;
  isComplete: boolean;
  organization: Organization;
  fights: Fight[];
}

const API_BASE_URL = 'http://10.0.0.53:3001/api';

export default function EventsScreen() {
  const [selectedTab, setSelectedTab] = useState<'upcoming' | 'past'>('upcoming');
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { accessToken } = useAuth();

  // Mock data for events
  const mockEvents: Event[] = [
    {
      id: '1',
      name: 'UFC 300: Pereira vs Hill',
      shortName: 'UFC 300',
      date: '2024-04-13T00:00:00Z',
      venue: 'T-Mobile Arena',
      location: 'Las Vegas, NV',
      isComplete: true,
      organization: {
        id: 'ufc',
        name: 'Ultimate Fighting Championship',
        shortName: 'UFC'
      },
      fights: [
        {
          id: 'fight1',
          fightOrder: 1,
          weightClass: 'Light Heavyweight',
          rounds: 5,
          isTitle: true,
          averageRating: 8.5,
          totalRatings: 1250,
          fighterA: { id: 'f1', firstName: 'Alex', lastName: 'Pereira' },
          fighterB: { id: 'f2', firstName: 'Jamahal', lastName: 'Hill' }
        },
        {
          id: 'fight2',
          fightOrder: 2,
          weightClass: 'Welterweight',
          rounds: 3,
          isTitle: false,
          averageRating: 7.8,
          totalRatings: 890,
          fighterA: { id: 'f3', firstName: 'Leon', lastName: 'Edwards' },
          fighterB: { id: 'f4', firstName: 'Colby', lastName: 'Covington' }
        }
      ]
    },
    {
      id: '2',
      name: 'UFC 301: Pantoja vs Erceg',
      shortName: 'UFC 301',
      date: '2024-05-04T00:00:00Z',
      venue: 'Farmasi Arena',
      location: 'Rio de Janeiro, Brazil',
      isComplete: false,
      organization: {
        id: 'ufc',
        name: 'Ultimate Fighting Championship',
        shortName: 'UFC'
      },
      fights: [
        {
          id: 'fight3',
          fightOrder: 1,
          weightClass: 'Flyweight',
          rounds: 5,
          isTitle: true,
          averageRating: 9.2,
          totalRatings: 2100,
          fighterA: { id: 'f5', firstName: 'Alexandre', lastName: 'Pantoja' },
          fighterB: { id: 'f6', firstName: 'Steve', lastName: 'Erceg' }
        }
      ]
    }
  ];

  const isLoading = false;
  const isRefetching = false;

  const events = selectedTab === 'past'
    ? mockEvents.filter(e => e.isComplete)
    : mockEvents.filter(e => !e.isComplete);

  const refetch = () => {
    console.log('Mock refetch called');
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
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  const renderMainEvent = (event: Event) => {
    const mainEvent = event.fights.find(fight => fight.fightOrder === 1);
    if (!mainEvent) return null;

    return (
      <View style={styles.mainEventContainer}>
        <Text style={[styles.mainEventLabel, { color: colors.primary }]}>
          {mainEvent.isTitle ? 'TITLE FIGHT' : 'MAIN EVENT'}
        </Text>
        <Text style={[styles.fighterNames, { color: colors.text }]}>
          {getFighterName(mainEvent.fighterA)}
        </Text>
        <Text style={[styles.vs, { color: colors.textSecondary }]}>vs</Text>
        <Text style={[styles.fighterNames, { color: colors.text }]}>
          {getFighterName(mainEvent.fighterB)}
        </Text>
        {mainEvent.averageRating && (
          <View style={styles.ratingContainer}>
            <Text style={[styles.rating, { color: colors.primary }]}>
              ⭐ {mainEvent.averageRating}/10
            </Text>
            <Text style={[styles.ratingCount, { color: colors.textSecondary }]}>
              ({mainEvent.totalRatings} ratings)
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderEventCard = ({ item: event }: { item: Event }) => (
    <TouchableOpacity style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.eventHeader}>
        <View style={styles.eventInfo}>
          <Text style={[styles.eventName, { color: colors.text }]}>{event.shortName}</Text>
          <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
            {formatDate(event.date)}
            {selectedTab === 'upcoming' && ` • ${formatTime(event.date)}`}
          </Text>
          {event.location && (
            <Text style={[styles.eventLocation, { color: colors.textSecondary }]}>
              📍 {event.location}
            </Text>
          )}
        </View>
        <View style={styles.orgBadge}>
          <Text style={[styles.orgText, { color: colors.primary }]}>
            {event.organization.shortName}
          </Text>
        </View>
      </View>

      {renderMainEvent(event)}

      {event.fights.length > 1 && (
        <Text style={[styles.moreFights, { color: colors.textSecondary }]}>
          +{event.fights.length - 1} more fight{event.fights.length > 2 ? 's' : ''}
        </Text>
      )}
    </TouchableOpacity>
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
            { color: selectedTab === 'upcoming' ? 'white' : colors.textSecondary }
          ]}>
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            selectedTab === 'past' && styles.activeTab,
            { borderColor: colors.border },
            selectedTab === 'past' && { backgroundColor: colors.primary }
          ]}
          onPress={() => setSelectedTab('past')}
        >
          <Text style={[
            styles.tabText,
            { color: selectedTab === 'past' ? 'white' : colors.textSecondary }
          ]}>
            Past Events
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  eventCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    marginBottom: 2,
  },
  eventLocation: {
    fontSize: 14,
  },
  orgBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  orgText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  mainEventContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  mainEventLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  fighterNames: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  vs: {
    fontSize: 14,
    marginVertical: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  rating: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  ratingCount: {
    fontSize: 12,
  },
  moreFights: {
    fontSize: 12,
    textAlign: 'center',
  },
});