import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { sharedStyles } from './shared/styles';
import { formatDate, getFighterImage } from './shared/utils';

interface EvenPredictionCardProps {
  fight: any;
  onPress: (fight: any) => void;
}

export default function EvenPredictionCard({ fight, onPress }: EvenPredictionCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [imageError, setImageError] = useState(false);

  const favoritePercentage = Math.round(fight.favoritePercentage || 0);
  const underdogPercentage = 100 - favoritePercentage;

  // Determine which fighter is the slight favorite
  const favoriteFighter = fight.slightFavorite === `${fight.fighter1.firstName} ${fight.fighter1.lastName}`
    ? fight.fighter1
    : fight.fighter2;

  const getImageSource = () => {
    if (imageError) {
      return require('../../assets/fighters/fighter-default-alpha.png');
    }
    return getFighterImage(favoriteFighter);
  };

  return (
    <TouchableOpacity onPress={() => onPress(fight)} activeOpacity={0.7}>
      <View style={[sharedStyles.container, {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        minHeight: 56,
        gap: 12,
        marginBottom: 4,
      }]}>
        {/* Fighter Headshot */}
        <Image
          source={getImageSource()}
          style={styles.fighterImage}
          onError={() => setImageError(true)}
        />

        {/* Prediction Content */}
        <View style={{ flex: 1 }}>
          {/* Prediction Text */}
          <Text style={[styles.predictionText, { color: colors.text }]} numberOfLines={1}>
            <Text style={{ fontWeight: '700' }}>{favoritePercentage}-{underdogPercentage}</Text>
            {' split: '}
            <Text style={{ fontWeight: '700' }}>{fight.slightFavorite}</Text>
            {' vs '}
            <Text style={{ fontWeight: '700' }}>{fight.slightUnderdog}</Text>
          </Text>

          {/* Event Info */}
          <Text style={[styles.eventInfo, { color: colors.textSecondary, marginTop: 4 }]} numberOfLines={1}>
            {fight.event.name} • {formatDate(fight.event.date)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fighterImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  predictionText: {
    fontSize: 13,
    lineHeight: 18,
  },
  eventInfo: {
    fontSize: 12,
  },
});
