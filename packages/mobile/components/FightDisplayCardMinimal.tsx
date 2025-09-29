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
    userReview?: { content: string; rating: number; createdAt: string; } | null;
    userTags?: string[] | null;
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

  // Helper function to remove nicknames from fighter names
  const cleanFighterName = (displayName: string) => {
    // Handle format: FirstName LastName "Nickname" -> FirstName LastName
    const nicknameMatch = displayName.match(/^(.+)\s+"([^"]+)"$/);
    return nicknameMatch ? nicknameMatch[1].trim() : displayName;
  };

  // Helper function to clean fight result text
  const cleanFightResult = (result: string) => {
    // Remove first names, keep only last names and method
    // Example: "Jon Jones defeats Max Holloway by TKO" -> "Jones defeats Holloway by TKO"
    return result
      .replace(/([A-Z][a-z]+)\s+([A-Z][a-z]+)/g, '$2') // Replace "FirstName LastName" with "LastName"
      .replace(/\s+/g, ' ') // Clean up extra spaces
      .trim();
  };

  // Check if user has interacted with the fight (rated, reviewed, or tagged)
  const hasUserInteracted = () => {
    return !!(fightData.userRating ||
              fightData.userReview ||
              (fightData.userTags && fightData.userTags.length > 0));
  };

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

      {/* Fighter Names - Full Width */}
      <Text style={[styles.matchup, { color: colors.text }]}>
        {cleanFighterName(fightData.fighter1)} vs {cleanFighterName(fightData.fighter2)}
      </Text>

      {/* Horizontal Info Row - Aggregate Rating, My Rating, Fight Status */}
      <View style={styles.horizontalInfoRow}>
        {/* Aggregate Rating (if fight is complete) */}
        {fightData.isComplete && fightData.aggregateRating && (
          <View style={styles.ratingRow}>
            <View style={styles.partialStarContainer}>
              {/* Empty star (outline) */}
              <FontAwesome
                name="star-o"
                size={20}
                color="#F5C518"
                style={styles.starBase}
              />
              {/* Filled star (clipped based on rating) */}
              <View style={[
                styles.filledStarContainer,
                {
                  height: `${Math.min(100, Math.max(0, fightData.aggregateRating === 10 ? 100 : fightData.aggregateRating * 8.5))}%`,
                }
              ]}>
                <FontAwesome
                  name="star"
                  size={20}
                  color="#F5C518"
                  style={styles.starFilled}
                />
              </View>
            </View>
            <Text style={[styles.aggregateLabel, { color: colors.textSecondary }]}>
              {fightData.aggregateRating}
            </Text>
          </View>
        )}

        {/* User's Personal Rating */}
        <View style={styles.ratingRow}>
          <FontAwesome
            name={fightData.userRating ? "star" : "star-o"}
            size={20}
            color="#83B4F3"
            style={styles.ratingIcon}
          />
          <Text style={[
            styles.userRatingText,
            { color: '#83B4F3' }
          ]}>
            {fightData.userRating ? `${fightData.userRating}` : (fightData.status === 'upcoming' ? 'Predict' : 'Rate')}
          </Text>
        </View>

        {/* Fight Status and Results */}
        <View style={styles.statusContainer}>
          {fightData.status === 'completed' && fightData.result && hasUserInteracted() && (
            <Text style={[styles.result, { color: colors.text }]}>
              {cleanFightResult(fightData.result)}
            </Text>
          )}

          {fightData.status === 'in_progress' && (
            <Text style={[styles.statusText, { color: colors.tint }]} numberOfLines={1}>
              {fightData.currentRound ? `Round ${fightData.currentRound}` :
               fightData.completedRounds ? `End R${fightData.completedRounds}` : 'Live'}
            </Text>
          )}

          {fightData.status === 'upcoming' && fightData.startTime && (
            <Text style={[styles.statusText, { color: colors.textSecondary }]} numberOfLines={1}>
              Starts: {fightData.startTime}
            </Text>
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
    fontStyle: 'italic',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusContainer: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: '40%',
  },
  horizontalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
    gap: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ratingIcon: {
    width: 24,
    textAlign: 'center',
    marginRight: 6,
  },
  partialStarContainer: {
    position: 'relative',
    width: 24,
    height: 20,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starBase: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  filledStarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  starFilled: {
    textAlign: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  userRatingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  aggregateLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  ratingCount: {
    fontSize: 11,
  },
});