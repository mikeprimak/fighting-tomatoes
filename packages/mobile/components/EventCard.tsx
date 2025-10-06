import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
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
  bannerImage?: string | null;
  earlyPrelimStartTime?: string | null;
  prelimStartTime?: string | null;
  mainStartTime?: string | null;
}

interface EventCardProps {
  event: Event;
  showTime?: boolean;
  onPress?: (event: Event) => void;
}

const getPlaceholderImage = (eventId: string) => {
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
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(16 / 9);
  const [countdown, setCountdown] = useState<{ time: string; label: string } | null>(null);

  // Animated value for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const calculateCountdown = (): { time: string; label: string } | null => {
    // Get the earliest start time from card times (prioritize specific times over generic date)
    const availableTimes = [
      { time: event.earlyPrelimStartTime, label: 'Early prelims start in' },
      { time: event.prelimStartTime, label: 'Prelims start in' },
      { time: event.mainStartTime, label: 'Main card starts in' },
    ].filter(item => item.time != null);

    // Only use event.date as fallback if no specific card times are available
    if (availableTimes.length === 0) {
      availableTimes.push({ time: event.date, label: 'Starts in' });
    }

    if (availableTimes.length === 0) {
      return null;
    }

    // Find the earliest time
    const earliest = availableTimes.reduce((earliestItem, currentItem) => {
      const currentDate = new Date(currentItem.time!);
      const earliestDate = new Date(earliestItem.time!);
      return currentDate < earliestDate ? currentItem : earliestItem;
    }, availableTimes[0]);

    const eventDate = new Date(earliest.time!);
    const now = new Date();
    const diff = eventDate.getTime() - now.getTime();

    // Only show countdown if event is within 12 hours and hasn't started
    const twelveHours = 12 * 60 * 60 * 1000;
    if (diff > 0 && diff <= twelveHours && !event.hasStarted) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let time: string;
      if (hours > 0) {
        time = `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        time = `${minutes}m ${seconds}s`;
      } else {
        time = `${seconds}s`;
      }

      return { time, label: earliest.label };
    }

    return null;
  };

  useEffect(() => {
    // Initial calculation
    setCountdown(calculateCountdown());

    // Update every second
    const interval = setInterval(() => {
      setCountdown(calculateCountdown());
    }, 1000);

    return () => clearInterval(interval);
  }, [event.earlyPrelimStartTime, event.prelimStartTime, event.mainStartTime, event.date, event.hasStarted]);

  // Start pulsing animation for live events
  useEffect(() => {
    const isLive = event.hasStarted && !event.isComplete;
    if (isLive) {
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
  }, [event.hasStarted, event.isComplete, pulseAnim]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const timeString = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    // Extract time and timezone acronym
    // Format: "7:00 PM PST" or "10:00 AM EST"
    return timeString;
  };

  const getDisplayTime = () => {
    // Only show time if mainStartTime is available
    if (event.mainStartTime) {
      return formatTime(event.mainStartTime);
    }
    return null;
  };

  const handlePress = () => {
    if (onPress) {
      onPress(event);
    } else {
      router.push({
        pathname: `/(tabs)/events/${event.id}` as any,
        params: { name: event.name }
      });
    }
  };

  const handleImageLoad = (e: any) => {
    const { width, height } = e.nativeEvent.source;
    if (width && height) {
      setImageAspectRatio(width / height);
    }
  };

  const styles = createStyles(colors, imageAspectRatio);

  return (
    <TouchableOpacity
      style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
    >
      {/* Event Image */}
      <Image
        source={event.bannerImage ? { uri: event.bannerImage } : getPlaceholderImage(event.id)}
        style={styles.eventImage}
        resizeMode="cover"
        onLoad={handleImageLoad}
      />

      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          <View style={styles.eventInfo}>
            <Text style={[styles.eventName, { color: colors.text }]}>{event.name}</Text>
            <View style={styles.dateRow}>
              <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
                {formatDate(event.date)}
                {showTime && !event.hasStarted && getDisplayTime() && ` • Main @ ${getDisplayTime()}`}
              </Text>
              {showTime && event.hasStarted && !event.isComplete && (
                <View style={styles.liveContainer}>
                  <Text style={[styles.eventDate, { color: colors.textSecondary }]}> • </Text>
                  <Animated.View style={[
                    styles.liveDot,
                    {
                      backgroundColor: colors.danger,
                      opacity: pulseAnim
                    }
                  ]} />
                  <Text style={[styles.liveText, { color: colors.danger }]}>
                    Live
                  </Text>
                </View>
              )}
            </View>
            {(event.venue || event.location) && (
              <Text style={[styles.eventLocation, { color: colors.textSecondary }]}>
                {[event.venue, event.location]
                  .filter(Boolean)
                  .map(s => s.trim())
                  .filter(s => s.length > 0)
                  .join(', ')
                  .replace(/,\s*,/g, ',')
                  .replace(/^,\s*/, '')
                  .replace(/\s*,$/, '')}
              </Text>
            )}
            {countdown && (
              <View style={[styles.countdownContainer, { backgroundColor: colors.warning }]}>
                <Text style={[styles.countdownText, { color: '#000' }]}>
                  {countdown.label} {countdown.time}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.orgBadge}>
            <Text style={[styles.orgText, { color: colors.primary }]}>
              {event.promotion}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any, aspectRatio: number) => StyleSheet.create({
  eventCard: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  eventImage: {
    width: '100%',
    height: undefined,
    aspectRatio: aspectRatio,
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  eventDate: {
    fontSize: 14,
  },
  eventLocation: {
    fontSize: 14,
  },
  liveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveText: {
    fontSize: 14,
    fontWeight: '600',
  },
  countdownContainer: {
    marginTop: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  countdownText: {
    fontSize: 14,
    fontWeight: 'bold',
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