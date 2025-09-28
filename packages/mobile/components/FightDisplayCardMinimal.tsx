import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

interface FightDisplayCardMinimalProps {
  fightData: {
    id: string;
    fighter1: string;
    fighter2: string;
    isMainEvent: boolean;
    isMainCard?: boolean;
    cardPosition?: number;
    weightClass: string;
    scheduledRounds: number;
    status: 'upcoming' | 'in_progress' | 'completed';
    isComplete: boolean;
    aggregateRating: number | null;
    totalRatings: number;
    userRating?: number | null;
    result?: string;
    startTime?: string;
    completedAt?: string;
    currentRound?: number;
    completedRounds?: number;
  };
  onPress: (fightData: any) => void;
}

export default function FightDisplayCardMinimal({ fightData, onPress }: FightDisplayCardMinimalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Determine background color based on fight status
  const getBackgroundColor = () => {
    switch (fightData.status) {
      case 'completed':
        return colorScheme === 'dark' ? '#1a2e1a' : '#f0f9f0'; // Dark green tint
      case 'in_progress':
        return colorScheme === 'dark' ? '#2e1a1a' : '#fff5f5'; // Dark red tint
      case 'upcoming':
      default:
        return colors.card; // Default card color
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: getBackgroundColor() }]}
      onPress={() => onPress(fightData)}
      activeOpacity={0.7}
    >
      {fightData.isMainEvent && (
        <Text style={[styles.mainEventLabel, { color: colors.tint }]}>
          MAIN EVENT
        </Text>
      )}

      <View style={styles.content}>
        <View style={styles.fightInfo}>
          <Text style={[styles.matchup, { color: colors.text }]}>
            {fightData.fighter1} vs {fightData.fighter2}
          </Text>
          <Text style={[styles.details, { color: colors.textSecondary }]}>
            {fightData.weightClass} • {fightData.scheduledRounds} Rounds
          </Text>

          {/* Fight Status and Results */}
          {fightData.status === 'completed' && fightData.result && (
            <Text style={[styles.result, { color: colors.text }]}>
              {fightData.result}
            </Text>
          )}

          {fightData.status === 'in_progress' && (
            <Text style={[styles.statusText, { color: colors.tint }]}>
              Round {fightData.currentRound} • In Progress
            </Text>
          )}

          {fightData.status === 'upcoming' && fightData.startTime && (
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              Starts: {fightData.startTime}
            </Text>
          )}
        </View>

        <View style={styles.ratingInfo}>
          {/* User's Personal Rating */}
          <View style={styles.userRatingSection}>
            <FontAwesome
              name={fightData.userRating ? "star" : "star-o"}
              size={16}
              color={fightData.userRating ? colors.tint : colors.textSecondary}
            />
            <Text style={[
              styles.userRatingText,
              { color: fightData.userRating ? colors.tint : colors.textSecondary }
            ]}>
              {fightData.userRating ? `${fightData.userRating}` : (fightData.status === 'upcoming' ? 'Predict' : 'Rate')}
            </Text>
          </View>

          {/* Aggregate Rating (if fight is complete) */}
          {fightData.isComplete && fightData.aggregateRating && (
            <View style={styles.aggregateRatingSection}>
              <Text style={[styles.aggregateLabel, { color: colors.textSecondary }]}>
                Avg: {fightData.aggregateRating}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  mainEventLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 1,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fightInfo: {
    flex: 1,
  },
  matchup: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  details: {
    fontSize: 14,
  },
  result: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    fontStyle: 'italic',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  ratingInfo: {
    alignItems: 'flex-end',
    marginLeft: 12,
    minWidth: 80,
  },
  userRatingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  userRatingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  aggregateRatingSection: {
    alignItems: 'flex-end',
  },
  aggregateLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  ratingCount: {
    fontSize: 11,
  },
});