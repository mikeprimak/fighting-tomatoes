import React, { memo } from 'react';
import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { PromotionLogo } from './PromotionLogo';
import { normalizeEventName } from './fight-cards/shared/utils';

interface EventBannerCardProps {
  event: {
    id: string;
    name: string;
    date: string;
    bannerImage?: string | null;
    hasStarted: boolean;
    isComplete: boolean;
    promotion?: string;
    mainStartTime?: string | null;
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
// Accepts optional promotion to normalize legacy event names
const parseEventName = (eventName: string, promotion?: string | null) => {
  // First normalize the event name to include promotion if missing
  const normalizedName = normalizeEventName(eventName, promotion);

  const colonMatch = normalizedName.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    return {
      line1: colonMatch[1].trim(),
      line2: colonMatch[2].replace(/\./g, '').trim(),
    };
  }

  const fightNightMatch = normalizedName.match(/^(UFC Fight Night)\s+(.+)$/i);
  if (fightNightMatch) {
    return {
      line1: fightNightMatch[1],
      line2: fightNightMatch[2].replace(/\./g, '').trim(),
    };
  }

  const numberedMatch = normalizedName.match(/^(UFC\s+\d+)\s*(.*)$/i);
  if (numberedMatch) {
    return {
      line1: numberedMatch[1],
      line2: numberedMatch[2].replace(/\./g, '').trim() || '',
    };
  }

  return {
    line1: normalizedName,
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

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;

  // Only show minutes if not on the hour
  if (minutes === 0) {
    return `${hour12}${ampm}`;
  }
  return `${hour12}:${minutes.toString().padStart(2, '0')}${ampm}`;
};

export const EventBannerCard = memo(function EventBannerCard({
  event,
  statusBadge,
  onPress,
}: EventBannerCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { line1, line2 } = parseEventName(event.name, event.promotion);
  const { width: screenWidth } = useWindowDimensions();

  // Use fixed aspect ratio to prevent layout shifts when items remount during scroll
  // UFC event banners are typically 16:9 aspect ratio
  const BANNER_ASPECT_RATIO = 16 / 9;
  const imageHeight = screenWidth / BANNER_ASPECT_RATIO;

  const imageSource = event.bannerImage ? { uri: event.bannerImage } : getPlaceholderImage(event.id);

  return (
    <View style={styles.container}>
      {/* Event Banner Image with overlays */}
      <View style={[styles.bannerContainer, { height: imageHeight }]}>
        <Image
          source={imageSource}
          style={[styles.banner, { height: imageHeight }]}
          resizeMode="cover"
        />

        {/* Overlays on banner image - Bottom Left */}
        <View style={styles.bannerOverlays}>
          {/* Promotion Logo */}
          {event.promotion && (
            <View style={styles.logoOverlay}>
              <PromotionLogo
                promotion={event.promotion}
                size={
                  event.promotion?.toUpperCase() === 'MVP' || event.promotion?.toUpperCase() === 'MOST VALUABLE PROMOTIONS' ? 32 :
                  event.promotion?.toUpperCase() === 'KARATE COMBAT' ? 34 :
                  event.promotion?.toUpperCase() === 'BKFC' ? 18 :
                  event.promotion?.toUpperCase() === 'OKTAGON' ? 34 :
                  event.promotion?.toUpperCase() === 'ZUFFA BOXING' || event.promotion?.toUpperCase() === 'ZUFFA' ? 44 : 28
                }
                color="#FFFFFF"
              />
            </View>
          )}

          {/* Date and Status stacked vertically */}
          <View style={[
            styles.dateStatusContainer,
            !event.promotion && styles.firstElementRounded
          ]}>
            {statusBadge && (
              <View style={[styles.statusBadgeOverlay, { backgroundColor: statusBadge.backgroundColor }]}>
                <Text style={[styles.statusBadgeText, statusBadge.textColor && { color: statusBadge.textColor }]}>
                  {statusBadge.text}
                </Text>
              </View>
            )}
            <Text style={styles.dateText}>
              {formatDate(event.date, event.isComplete)}
              {event.mainStartTime && !event.hasStarted && !event.isComplete && (
                <Text style={styles.timeText}>{`  •  ${formatTime(event.mainStartTime)}`}</Text>
              )}
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
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
  },
  bannerContainer: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  banner: {
    width: '100%',
  },
  logoOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: -1, // Overlap to prevent subpixel gap
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerOverlays: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    gap: 0,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  dateStatusContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  statusBadgeOverlay: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
    alignSelf: 'stretch',
  },
  firstElementRounded: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  info: {
    padding: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
  },
});
