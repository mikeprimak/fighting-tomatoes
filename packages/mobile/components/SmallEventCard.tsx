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
}

interface SmallEventCardProps {
  event: Event;
  onPress: () => void;
}

export default function SmallEventCard({ event, onPress }: SmallEventCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

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
      </View>
    </TouchableOpacity>
  );
}
