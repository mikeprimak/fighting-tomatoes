import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface CommunityPredictionsCardProps {
  predictionStats: {
    totalPredictions: number;
    winnerPredictions: {
      fighter1: { id: string; name: string; predictions: number; percentage: number };
      fighter2: { id: string; name: string; predictions: number; percentage: number };
    };
    methodPredictions: {
      DECISION: number;
      KO_TKO: number;
      SUBMISSION: number;
    };
    roundPredictions: Record<number, number>;
    fighter1MethodPredictions: {
      DECISION: number;
      KO_TKO: number;
      SUBMISSION: number;
    };
    fighter1RoundPredictions: Record<number, number>;
    fighter2MethodPredictions: {
      DECISION: number;
      KO_TKO: number;
      SUBMISSION: number;
    };
    fighter2RoundPredictions: Record<number, number>;
  };
}

export function CommunityPredictionsCard({ predictionStats }: CommunityPredictionsCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const {
    totalPredictions,
    winnerPredictions,
    fighter1MethodPredictions,
    fighter1RoundPredictions,
    fighter2MethodPredictions,
    fighter2RoundPredictions
  } = predictionStats;

  // If no predictions, don't render anything
  if (totalPredictions === 0) {
    return null;
  }

  // Helper function to find most popular method
  const getMostPopularMethod = (methods: { DECISION: number; KO_TKO: number; SUBMISSION: number }) => {
    const methodEntries = Object.entries(methods) as [string, number][];
    const mostPopular = methodEntries.reduce((max, curr) =>
      curr[1] > max[1] ? curr : max
    , ['DECISION', 0] as [string, number]);

    const total = methodEntries.reduce((sum, [_, count]) => sum + count, 0);

    return {
      method: mostPopular[0],
      count: mostPopular[1],
      percentage: total > 0 ? Math.round((mostPopular[1] / total) * 100) : 0,
      label: {
        'DECISION': 'Decision',
        'KO_TKO': 'KO/TKO',
        'SUBMISSION': 'Submission',
      }[mostPopular[0]] || mostPopular[0],
      icon: {
        'DECISION': 'gavel',
        'KO_TKO': 'fist-raised',
        'SUBMISSION': 'hands',
      }[mostPopular[0]] || 'question',
    };
  };

  // Helper function to find most popular round
  const getMostPopularRound = (rounds: Record<number, number>) => {
    const roundEntries = Object.entries(rounds)
      .map(([round, count]) => [parseInt(round), count] as [number, number])
      .filter(([_, count]) => count > 0);

    if (roundEntries.length === 0) return null;

    const mostPopular = roundEntries.reduce((max, curr) =>
      curr[1] > max[1] ? curr : max,
      [1, 0] as [number, number]
    );

    const total = roundEntries.reduce((sum, [_, count]) => sum + count, 0);

    return {
      round: mostPopular[0],
      count: mostPopular[1],
      percentage: total > 0 ? Math.round((mostPopular[1] / total) * 100) : 0,
    };
  };

  // Get per-fighter stats
  const fighter1Method = getMostPopularMethod(fighter1MethodPredictions);
  const fighter1Round = getMostPopularRound(fighter1RoundPredictions);

  const fighter2Method = getMostPopularMethod(fighter2MethodPredictions);
  const fighter2Round = getMostPopularRound(fighter2RoundPredictions);

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Community Predictions</Text>

      {/* Winner Predictions */}
      <View style={styles.section}>
        <View style={styles.splitBarContainer}>
          {/* Fighter names above bar */}
          <View style={styles.fighterNamesRow}>
            <Text style={[styles.fighterNameLeft, { color: colors.text }]} numberOfLines={1}>
              {winnerPredictions.fighter1.name}
            </Text>
            <Text style={[styles.fighterNameRight, { color: colors.text }]} numberOfLines={1}>
              {winnerPredictions.fighter2.name}
            </Text>
          </View>

          {/* Single split bar */}
          <View style={styles.splitBar}>
            {winnerPredictions.fighter1.percentage > 0 && (
              <View
                style={[
                  styles.splitBarLeft,
                  {
                    width: winnerPredictions.fighter2.percentage === 0 ? '100%' : `${winnerPredictions.fighter1.percentage}%`,
                    backgroundColor: '#83B4F3'
                  }
                ]}
              >
                <Text style={styles.splitBarPercentage}>
                  {winnerPredictions.fighter2.percentage === 0 ? '100' : winnerPredictions.fighter1.percentage}%
                </Text>
              </View>
            )}
            {winnerPredictions.fighter2.percentage > 0 && (
              <View
                style={[
                  styles.splitBarRight,
                  {
                    width: winnerPredictions.fighter1.percentage === 0 ? '100%' : `${winnerPredictions.fighter2.percentage}%`,
                    backgroundColor: '#FF6B35'
                  }
                ]}
              >
                <Text style={styles.splitBarPercentage}>
                  {winnerPredictions.fighter1.percentage === 0 ? '100' : winnerPredictions.fighter2.percentage}%
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Per-Fighter Predictions Row */}
        <View style={styles.predictionTextRow}>
          {/* Fighter 1 Prediction (Left) */}
          {fighter1Method.count > 0 && fighter1Round && (
            <Text style={[styles.predictionTextLeft, { color: '#83B4F3' }]}>
              by {fighter1Method.label} in Round {fighter1Round.round}
            </Text>
          )}

          {/* Fighter 2 Prediction (Right) */}
          {fighter2Method.count > 0 && fighter2Round && (
            <Text style={[styles.predictionTextRight, { color: '#FF6B35' }]}>
              {fighter2Method.label} in Round {fighter2Round.round}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  splitBarContainer: {
    gap: 8,
  },
  fighterNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  fighterNameLeft: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
  },
  fighterNameRight: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  splitBar: {
    flexDirection: 'row',
    height: 32,
    borderRadius: 6,
    overflow: 'hidden',
  },
  splitBarLeft: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: '20%',
  },
  splitBarRight: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: '20%',
  },
  splitBarPercentage: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
  },
  predictionTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: -6,
    paddingHorizontal: 4,
  },
  predictionTextLeft: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'left',
    flex: 1,
  },
  predictionTextRight: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
  },
});
