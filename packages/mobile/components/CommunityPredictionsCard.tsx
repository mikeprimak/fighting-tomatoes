import React from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { FontAwesome, FontAwesome5 } from '@expo/vector-icons';
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
  userPrediction?: {
    winner: string | null;
    method: string | null;
  } | null;
  onPress?: () => void;
}

export function CommunityPredictionsCard({ predictionStats, userPrediction, onPress }: CommunityPredictionsCardProps) {
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

  // Helper function to format method
  const formatMethod = (method: string | null | undefined) => {
    if (!method) return '';
    if (method === 'KO_TKO') return 'KO';
    if (method === 'DECISION') return 'Decision';
    if (method === 'SUBMISSION') return 'Submission';
    return method;
  };

  // Helper function to get last name (everything except first name)
  const getLastName = (fullName: string) => {
    if (!fullName) return fullName;
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) return parts[0];
    return parts.slice(1).join(' ');
  };

  // If no predictions, don't render anything
  if (totalPredictions === 0) {
    return null;
  }

  // Helper function to find top methods with their percentages
  const getTopMethods = (methods: { DECISION: number; KO_TKO: number; SUBMISSION: number }) => {
    const methodEntries = Object.entries(methods) as [string, number][];
    const total = methodEntries.reduce((sum, [_, count]) => sum + count, 0);

    if (total === 0) return [];

    // Sort by count descending
    const sorted = methodEntries
      .map(([method, count]) => ({
        method,
        count,
        percentage: Math.round((count / total) * 100),
        label: {
          'DECISION': 'Decision',
          'KO_TKO': 'KO/TKO',
          'SUBMISSION': 'Submission',
        }[method] || method,
      }))
      .filter(m => m.count > 0)
      .sort((a, b) => b.count - a.count);

    // Return top method, plus second if it's 33% or more
    const result = [sorted[0]];
    if (sorted[1] && sorted[1].percentage >= 33) {
      result.push(sorted[1]);
    }

    return result;
  };

  // Get per-fighter stats
  const fighter1Methods = getTopMethods(fighter1MethodPredictions);
  const fighter2Methods = getTopMethods(fighter2MethodPredictions);

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* My Prediction */}
      {userPrediction ? (
        <View style={styles.myPredictionRow}>
          <View style={styles.iconContainer}>
            <FontAwesome name="eye" size={12} color="#83B4F3" />
          </View>
          <Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>
            My Prediction:
          </Text>
          <Text style={[styles.outcomeLineText, { flex: 1 }]} numberOfLines={1}>
            <Text style={{ color: colors.text }}>
              {getLastName(userPrediction.winner) || ''}
            </Text>
            {userPrediction.method && (
              <Text style={{ color: colors.textSecondary }}>
                {' by '}{formatMethod(userPrediction.method)}
              </Text>
            )}
          </Text>
        </View>
      ) : (
        <View style={styles.myPredictionRow}>
          <View style={styles.iconContainer}>
            <FontAwesome name="eye" size={12} color={colors.textSecondary} />
          </View>
          <Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>
            My Prediction:
          </Text>
          <Text style={[styles.outcomeLineText, { color: colors.textSecondary }]}>

          </Text>
        </View>
      )}

      {/* Community Predictions Label */}
      <View style={styles.communityLabelRow}>
        <View style={styles.iconContainer}>
          <FontAwesome name="bar-chart" size={12} color="#F5C518" />
        </View>
        <Text style={[styles.outcomeLabel, { color: colors.textSecondary }]}>
          Community Predictions
        </Text>
      </View>

      {/* Winner Predictions */}
      <View style={styles.section}>
        <View style={styles.splitBarContainer}>
          {/* Fighter names above bar */}
          <View style={styles.fighterNamesRow}>
            <Text style={[styles.fighterNameLeft, { color: colors.text }]} numberOfLines={1}>
              {getLastName(winnerPredictions.fighter1.name)}
            </Text>
            <Text style={[styles.fighterNameRight, { color: colors.text }]} numberOfLines={1}>
              {getLastName(winnerPredictions.fighter2.name)}
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
                    backgroundColor: '#F5C518'
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
                    backgroundColor: '#FFC107'
                  }
                ]}
              >
                <Text style={[styles.splitBarPercentage, { color: '#000' }]}>
                  {winnerPredictions.fighter1.percentage === 0 ? '100' : winnerPredictions.fighter2.percentage}%
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Per-Fighter Predictions Row */}
        <View style={styles.predictionTextRow}>
          {/* Fighter 1 Prediction (Left) */}
          {fighter1Methods.length > 0 && (
            <Text style={[styles.predictionTextLeft, { color: '#F5C518' }]}>
              {fighter1Methods.map(m => m.label).join(' or ')}
            </Text>
          )}

          {/* Fighter 2 Prediction (Right) */}
          {fighter2Methods.length > 0 && (
            <Text style={[styles.predictionTextRight, { color: '#FFC107' }]}>
              {fighter2Methods.map(m => m.label).join(' or ')}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 4,
    marginBottom: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  myPredictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  communityLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  iconContainer: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  outcomeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  outcomeLineText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
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
    color: '#000',
  },
  predictionTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 3,
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
