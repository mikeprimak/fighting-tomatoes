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

export default function FighterCard({ fighter, onPress }: FighterCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  const getFighterRecord = (fighter: Fighter) => {
    return `${fighter.wins}-${fighter.losses}-${fighter.draws}`;
  };

  const handlePress = () => {
    if (onPress) {
      onPress(fighter);
    } else {
      router.push(`/(tabs)/fighters/${fighter.id}`);
    }
  };

  const styles = createStyles(colors);

  return (
    <TouchableOpacity
      style={[styles.fighterCard, { backgroundColor: colors.card, borderColor: colors.border }]}
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

        <View style={styles.recordContainer}>
          <Text style={[styles.record, { color: colors.primary }]}>
            {getFighterRecord(fighter)}
          </Text>
          <Text style={[styles.recordLabel, { color: colors.textSecondary }]}>
            W-L-D
          </Text>
        </View>

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
    borderWidth: 1,
  },
  fighterImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#ddd',
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
  recordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  record: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 6,
  },
  recordLabel: {
    fontSize: 12,
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