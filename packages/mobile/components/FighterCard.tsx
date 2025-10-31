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

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  wins: number;
  losses: number;
  draws: number;
  weightClass?: string;
}

interface FighterCardProps {
  fighter: Fighter;
  onPress?: (fighter: Fighter) => void;
  avgRating?: number; // Average rating from last 3 fights
  fightCount?: number; // Number of fights used for average
}

// Fighter image selection logic (same as other components)
const getFighterImage = (fighterId: string) => {
  const images = [
    require('../assets/fighters/fighter-1.jpg'),
    require('../assets/fighters/fighter-2.jpg'),
    require('../assets/fighters/fighter-3.jpg'),
    require('../assets/fighters/fighter-4.jpg'),
    require('../assets/fighters/fighter-5.jpg'),
    require('../assets/fighters/fighter-6.jpg'),
  ];

  // Use charCodeAt to get a number from the last character (works for letters and numbers)
  const lastCharCode = fighterId.charCodeAt(fighterId.length - 1);
  const index = lastCharCode % images.length;
  return images[index];
};

export default function FighterCard({ fighter, onPress, avgRating, fightCount }: FighterCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  const handlePress = () => {
    if (onPress) {
      onPress(fighter);
    } else {
      router.push(`/fighter/${fighter.id}`);
    }
  };

  const styles = createStyles(colors);

  return (
    <TouchableOpacity
      style={[styles.fighterCard, { backgroundColor: colors.card }]}
      onPress={handlePress}
    >
      <Image
        source={getFighterImage(fighter.id)}
        style={styles.fighterImage}
        resizeMode="cover"
      />

      <View style={styles.fighterInfo}>
        <Text style={[styles.fighterName, { color: colors.text }]}>
          {getFighterName(fighter)}
        </Text>

        {avgRating !== undefined && fightCount !== undefined && (
          <View style={styles.ratingContainer}>
            <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>
              Avg Score (last {fightCount} {fightCount === 1 ? 'fight' : 'fights'}):
            </Text>
            <Text style={[styles.rating, { color: colors.primary }]}>
              {avgRating.toFixed(1)}/10
            </Text>
          </View>
        )}

        <View style={styles.detailsContainer}>
          {fighter.weightClass && (
            <Text style={[styles.detail, { color: colors.textSecondary }]}>
              {fighter.weightClass}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.chevron}>
        <Text style={[styles.chevronText, { color: colors.textSecondary }]}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  fighterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
  },
  fighterImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  fighterInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  fighterName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  ratingLabel: {
    fontSize: 12,
    marginRight: 4,
  },
  rating: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  detailsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detail: {
    fontSize: 12,
  },
  chevron: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 20,
  },
  chevronText: {
    fontSize: 24,
    fontWeight: '300',
  },
});