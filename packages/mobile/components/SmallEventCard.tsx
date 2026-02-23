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
import { formatEventDate, formatTimeUntil } from '../utils/dateFormatters';

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

  const formatDate = (dateString: string) => formatEventDate(dateString, { weekday: false, year: true });

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
              {formatTimeUntil(event.date, getEarliestStartTime())}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
