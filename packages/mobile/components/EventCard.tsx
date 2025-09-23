import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../constants/Colors';

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

interface EventCardProps {
  event: Event;
  showTime?: boolean;
  onPress?: (event: Event) => void;
}

const getEventImage = (eventId: string) => {
  const images = [
    require('../assets/events/event-banner-1.jpg'),
    require('../assets/events/event-banner-2.jpg'),
    require('../assets/events/event-banner-3.jpg'),
  ];

  // Use charCodeAt to get a number from the last character (works for letters and numbers)
  const lastCharCode = eventId.charCodeAt(eventId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export default function EventCard({ event, showTime = false, onPress }: EventCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

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

  const handlePress = () => {
    if (onPress) {
      onPress(event);
    } else {
      router.push(`/event/${event.id}`);
    }
  };

  const styles = createStyles(colors);

  return (
    <TouchableOpacity
      style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
    >
      {/* Event Image */}
      <Image
        source={getEventImage(event.id)}
        style={styles.eventImage}
        resizeMode="cover"
      />

      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          <View style={styles.eventInfo}>
            <Text style={[styles.eventName, { color: colors.text }]}>{event.name}</Text>
            <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
              {formatDate(event.date)}
              {showTime && ` • ${formatTime(event.date)}`}
            </Text>
            {event.location && (
              <Text style={[styles.eventLocation, { color: colors.textSecondary }]}>
                📍 {event.location}
              </Text>
            )}
          </View>
          <View style={styles.orgBadge}>
            <Text style={[styles.orgText, { color: colors.primary }]}>
              {event.promotion}
            </Text>
          </View>
        </View>

        <View style={styles.eventFooter}>
          <Text style={[styles.eventStatus, { color: colors.textSecondary }]}>
            Tap to view fights
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  eventCard: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  eventImage: {
    width: '100%',
    height: 120,
  },
  eventContent: {
    padding: 16,
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
  eventFooter: {
    paddingTop: 8,
    alignItems: 'center',
  },
  eventStatus: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});