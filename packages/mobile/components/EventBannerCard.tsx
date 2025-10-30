import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

interface EventBannerCardProps {
  event: {
    id: string;
    name: string;
    date: string;
    bannerImage?: string | null;
    hasStarted: boolean;
    isComplete: boolean;
  };
  statusBadge?: {
    text: string;
    backgroundColor: string;
    textColor?: string;
  };
  onPress?: () => void;
}

// Placeholder image selection logic
const getPlaceholderImage = (eventId: string) => {
  const images = [
    require('../assets/events/event-banner-1.jpg'),
    require('../assets/events/event-banner-2.jpg'),
    require('../assets/events/event-banner-3.jpg'),
  ];

  const lastCharCode = eventId.charCodeAt(eventId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

// Parse event name into formatted display
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

export function EventBannerCard({
  event,
  statusBadge,
  onPress,
}: EventBannerCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { line1, line2 } = parseEventName(event.name);

  const imageSource = event.bannerImage ? { uri: event.bannerImage } : getPlaceholderImage(event.id);
  console.log('EventBannerCard - Event:', event.name);
  console.log('EventBannerCard - bannerImage:', event.bannerImage);
  console.log('EventBannerCard - imageSource:', imageSource);

  return (
    <View style={styles.container}>
      {/* Event Banner Image */}
      <Image
        source={imageSource}
        style={styles.banner}
        resizeMode="cover"
        onError={(error) => console.log('Image load error:', error.nativeEvent)}
        onLoad={() => console.log('Image loaded successfully for:', event.name)}
      />

      {/* Event Info */}
      <View style={[styles.info, { backgroundColor: colors.card }]}>
        <Text style={[styles.name, { color: colors.text }]}>
          {line2 ? `${line1}: ${line2}` : line1}
        </Text>

        <View style={styles.meta}>
          {statusBadge && (
            <View style={[styles.statusBadge, { backgroundColor: statusBadge.backgroundColor }]}>
              <Text style={[styles.statusBadgeText, statusBadge.textColor && { color: statusBadge.textColor }]}>
                {statusBadge.text}
              </Text>
            </View>
          )}
          <Text style={[styles.date, { color: colors.textSecondary }]}>
            {formatDate(event.date)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  banner: {
    width: '100%',
    height: 200,
  },
  info: {
    padding: 16,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  date: {
    fontSize: 14,
  },
});
