import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  useColorScheme,
} from 'react-native';
import { Colors } from '../constants/Colors';

interface Event {
  id: string;
  name: string;
  date: string;
  bannerImage?: string;
  promotion?: string;
  earlyPrelimStartTime?: string | null;
  prelimStartTime?: string | null;
  mainStartTime?: string | null;
}

interface SmallEventCardProps {
  event: Event;
  onPress: () => void;
}

export default function SmallEventCard({ event, onPress }: SmallEventCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Get the earliest start time for countdown display
  const getEarliestStartTime = () => {
    if (event.earlyPrelimStartTime) return event.earlyPrelimStartTime;
    if (event.prelimStartTime) return event.prelimStartTime;
    if (event.mainStartTime) return event.mainStartTime;
    return event.date;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTimeUntil = (dateString: string) => {
    const eventDate = new Date(dateString);
    const now = new Date();

    // Use hours-based calculation for accuracy across timezones
    const hoursUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntil <= 0) {
      return 'TODAY';
    }

    if (hoursUntil < 1) {
      return 'STARTING SOON';
    }

    if (hoursUntil < 12) {
      const hours = Math.floor(hoursUntil);
      if (hours === 1) {
        return 'IN 1 HOUR';
      }
      return `IN ${hours} HOURS`;
    }

    if (hoursUntil < 24) {
      return 'TODAY';
    }

    if (hoursUntil < 48) {
      return 'TOMORROW';
    }

    const daysUntil = Math.floor(hoursUntil / 24);

    if (daysUntil < 7) {
      return `IN ${daysUntil} DAYS`;
    }

    const weeksUntil = Math.round(daysUntil / 7);
    if (weeksUntil === 1) {
      return 'IN 1 WEEK';
    }

    if (weeksUntil < 4) {
      return `IN ${weeksUntil} WEEKS`;
    }

    const monthsUntil = Math.round(daysUntil / 30);
    if (monthsUntil === 1) {
      return 'IN 1 MONTH';
    }

    if (monthsUntil < 12) {
      return `IN ${monthsUntil} MONTHS`;
    }

    const yearsUntil = Math.round(daysUntil / 365);
    if (yearsUntil === 1) {
      return 'IN 1 YEAR';
    }

    return `IN ${yearsUntil} YEARS`;
  };

  const isUpcoming = new Date(getEarliestStartTime()) > new Date();

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    bannerContainer: {
      width: '33%',
      aspectRatio: 1,
      backgroundColor: colors.border,
    },
    bannerImage: {
      width: '100%',
      height: '100%',
    },
    contentContainer: {
      flex: 1,
      padding: 12,
      justifyContent: 'center',
    },
    eventName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    eventDate: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    eventTimeUntil: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: '#F5C518',
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    eventTimeUntilText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#000000',
    },
  });

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.bannerContainer}>
        {event.bannerImage ? (
          <Image
            source={{ uri: event.bannerImage }}
            style={styles.bannerImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.bannerImage, { backgroundColor: colors.border }]} />
        )}
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.eventName} numberOfLines={2}>
          {event.name}
        </Text>
        <Text style={styles.eventDate}>
          {formatDate(event.date)}
        </Text>
        {isUpcoming && (
          <View style={styles.eventTimeUntil}>
            <Text style={styles.eventTimeUntilText}>
              {formatTimeUntil(getEarliestStartTime())}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
