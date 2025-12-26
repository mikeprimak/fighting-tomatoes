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
import { getFighterImage, getFighterName } from './fight-cards/shared/utils';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  wins: number;
  losses: number;
  draws: number;
  weightClass?: string;
  profileImage?: string | null;
}

interface FighterCardProps {
  fighter: Fighter;
  onPress?: (fighter: Fighter) => void;
  avgRating?: number; // Average rating from last 3 fights
  fightCount?: number; // Number of fights used for average
  lastFightDate?: string; // Most recent completed fight date
  nextFightDate?: string; // Next upcoming fight date
}

export default function FighterCard({ fighter, onPress, avgRating, fightCount, lastFightDate, nextFightDate }: FighterCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];


  const getRelativeTimeText = () => {
    if (nextFightDate) {
      const now = new Date();
      const fightDate = new Date(nextFightDate);
      const diffMs = fightDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Fights today';
      if (diffDays === 1) return 'Fights tomorrow';
      if (diffDays <= 7) return `Fights in ${diffDays} days`;
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks === 1) return 'Fights in 1 week';
      return `Fights in ${diffWeeks} weeks`;
    }

    if (lastFightDate) {
      const now = new Date();
      const fightDate = new Date(lastFightDate);
      const diffMs = now.getTime() - fightDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Fought today';
      if (diffDays === 1) return 'Fought yesterday';
      if (diffDays <= 7) return `Fought ${diffDays} days ago`;
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks === 1) return 'Fought 1 week ago';
      return `Fought ${diffWeeks} weeks ago`;
    }

    return null;
  };

  const handlePress = () => {
    if (onPress) {
      onPress(fighter);
    } else {
      router.push(`/fighter/${fighter.id}` as any);
    }
  };

  const styles = createStyles(colors);

  return (
    <TouchableOpacity
      style={[styles.fighterCard, { backgroundColor: colors.card }]}
      onPress={handlePress}
    >
      <Image
        source={getFighterImage(fighter)}
        style={styles.fighterImage}
        resizeMode="cover"
      />

      <View style={styles.fighterInfo}>
        <Text style={[styles.fighterName, { color: colors.text }]}>
          {getFighterName(fighter)}
        </Text>

        {avgRating !== undefined && fightCount !== undefined && (
          <View style={styles.ratingContainer}>
            {fightCount === 0 ? (
              <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>
                No average rating available.
              </Text>
            ) : (
              <>
                <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>
                  Avg Rating (last {fightCount} {fightCount === 1 ? 'fight' : 'fights'}):
                </Text>
                <Text style={[styles.rating, { color: colors.primary }]}>
                  {avgRating.toFixed(1)}/10
                </Text>
              </>
            )}
          </View>
        )}

        {getRelativeTimeText() && (
          <Text style={[styles.relativeTime, { color: colors.textSecondary }]}>
            {getRelativeTimeText()}
          </Text>
        )}
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
  relativeTime: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
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