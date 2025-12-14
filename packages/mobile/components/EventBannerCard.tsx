import React from 'react';
import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';
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
    promotion?: string;
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

const formatDate = (dateString: string, isComplete: boolean) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(isComplete && { year: 'numeric' }), // Only show year for completed events
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
  const { width: screenWidth } = useWindowDimensions();

  // Use fixed aspect ratio to prevent layout shifts when items remount during scroll
  // UFC event banners are typically 16:9 aspect ratio
  const BANNER_ASPECT_RATIO = 16 / 9;
  const fullImageHeight = screenWidth / BANNER_ASPECT_RATIO;
  const containerHeight = fullImageHeight * 0.7; // Show only top 70%

  const imageSource = event.bannerImage ? { uri: event.bannerImage } : getPlaceholderImage(event.id);

  return (
    <View style={styles.container}>
      {/* Event Banner Image with overlays */}
      <View style={[styles.bannerContainer, { height: containerHeight }]}>
        <Image
          source={imageSource}
          style={[styles.banner, { height: fullImageHeight }]}
          resizeMode="cover"
        />

        {/* Overlays on banner image - Bottom Left */}
        <View style={styles.bannerOverlays}>
          {statusBadge && (
            <View style={[styles.statusBadgeOverlay, { backgroundColor: statusBadge.backgroundColor }]}>
              <Text style={[styles.statusBadgeText, statusBadge.textColor && { color: statusBadge.textColor }]}>
                {event.promotion ? `${event.promotion} - ${statusBadge.text}` : statusBadge.text}
              </Text>
            </View>
          )}

          <View style={[
            styles.dateOverlay,
            !statusBadge && styles.dateOverlayRoundedLeft
          ]}>
            <Text style={styles.dateText}>
              {formatDate(event.date, event.isComplete)}
            </Text>
          </View>
        </View>
      </View>

      {/* Event Name */}
      <View style={[styles.info, { backgroundColor: colors.card }]}>
        <Text style={[styles.name, { color: colors.text }]}>
          {line2 ? `${line1}: ${line2}` : line1}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  bannerContainer: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  banner: {
    width: '100%',
  },
  bannerOverlays: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    gap: 0,
    alignItems: 'center',
  },
  statusBadgeOverlay: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  dateOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateOverlayRoundedLeft: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  info: {
    padding: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
