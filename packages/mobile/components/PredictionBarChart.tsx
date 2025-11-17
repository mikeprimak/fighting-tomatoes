import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

interface PredictionBarChartProps {
  fighter1Name: string;
  fighter2Name: string;
  fighter1Id: string;
  fighter2Id: string;
  selectedWinner?: string;
  selectedMethod?: string;
  // Prediction stats for each fighter and method
  fighter1Predictions: {
    KO_TKO: number;
    SUBMISSION: number;
    DECISION: number;
  };
  fighter2Predictions: {
    KO_TKO: number;
    SUBMISSION: number;
    DECISION: number;
  };
  totalPredictions: number;
  winnerPredictions: {
    fighter1: {
      count: number;
      percentage: number;
    };
    fighter2: {
      count: number;
      percentage: number;
    };
  };
  // Control flags for progressive reveal
  showColors?: boolean; // Show colors and percentages (requires winner selection)
  showLabels?: boolean; // Show method labels (requires method selection)
}

/**
 * PredictionBarChart - Displays community predictions as a horizontal bar chart
 * Shows winner split and method subdivisions for each fighter
 */
export default function PredictionBarChart({
  fighter1Name,
  fighter2Name,
  fighter1Id,
  fighter2Id,
  selectedWinner,
  selectedMethod,
  fighter1Predictions,
  fighter2Predictions,
  totalPredictions,
  winnerPredictions,
  showColors = true,
  showLabels = true,
}: PredictionBarChartProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // If no colors revealed, show grey outline only
  if (!showColors) {
    return (
      <View style={styles.container}>
        <View
          style={{
            height: 40,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: '#808080',
            backgroundColor: 'transparent',
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Community Predictions Bar - progressive reveal */}
      {winnerPredictions && (
        <View style={{ flex: 1 }}>
          <View
            style={{
              height: 40,
              flexDirection: 'row',
              borderRadius: 8,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Fighter 1 side */}
            <View
              style={{
                flex: winnerPredictions.fighter1.percentage,
                flexDirection: 'row',
                backgroundColor: colors.background,
              }}
            >
              {/* Fighter 1 method subdivisions - show if labels revealed or as plain bars */}
              {fighter1Predictions && showLabels ? (
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  {fighter1Predictions.KO_TKO > 0 && (
                    <View
                      style={{
                        flex: fighter1Predictions.KO_TKO,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderRightWidth: 1,
                        borderRightColor: colors.border,
                        backgroundColor:
                          selectedWinner === fighter1Id && selectedMethod === 'KO_TKO'
                            ? '#F5C518'
                            : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          color:
                            selectedWinner === fighter1Id && selectedMethod === 'KO_TKO'
                              ? '#000'
                              : colors.text,
                        }}
                      >
                        KO
                      </Text>
                    </View>
                  )}
                  {fighter1Predictions.SUBMISSION > 0 && (
                    <View
                      style={{
                        flex: fighter1Predictions.SUBMISSION,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderRightWidth: 1,
                        borderRightColor: colors.border,
                        backgroundColor:
                          selectedWinner === fighter1Id && selectedMethod === 'SUBMISSION'
                            ? '#F5C518'
                            : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          color:
                            selectedWinner === fighter1Id && selectedMethod === 'SUBMISSION'
                              ? '#000'
                              : colors.text,
                        }}
                      >
                        SUB
                      </Text>
                    </View>
                  )}
                  {fighter1Predictions.DECISION > 0 && (
                    <View
                      style={{
                        flex: fighter1Predictions.DECISION,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor:
                          selectedWinner === fighter1Id && selectedMethod === 'DECISION'
                            ? '#F5C518'
                            : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          color:
                            selectedWinner === fighter1Id && selectedMethod === 'DECISION'
                              ? '#000'
                              : colors.text,
                        }}
                      >
                        DEC
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ flex: 1 }} />
              )}
            </View>

            {/* Fighter 2 side */}
            <View
              style={{
                flex: winnerPredictions.fighter2.percentage,
                flexDirection: 'row',
                backgroundColor: '#A0A0A0',
              }}
            >
              {/* Fighter 2 method subdivisions - show if labels revealed or as plain bars */}
              {fighter2Predictions && showLabels ? (
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  {fighter2Predictions.KO_TKO > 0 && (
                    <View
                      style={{
                        flex: fighter2Predictions.KO_TKO,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderRightWidth: 1,
                        borderRightColor: colors.border,
                        backgroundColor:
                          selectedWinner === fighter2Id && selectedMethod === 'KO_TKO'
                            ? '#F5C518'
                            : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#000' }}>KO</Text>
                    </View>
                  )}
                  {fighter2Predictions.SUBMISSION > 0 && (
                    <View
                      style={{
                        flex: fighter2Predictions.SUBMISSION,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderRightWidth: 1,
                        borderRightColor: colors.border,
                        backgroundColor:
                          selectedWinner === fighter2Id && selectedMethod === 'SUBMISSION'
                            ? '#F5C518'
                            : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#000' }}>SUB</Text>
                    </View>
                  )}
                  {fighter2Predictions.DECISION > 0 && (
                    <View
                      style={{
                        flex: fighter2Predictions.DECISION,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor:
                          selectedWinner === fighter2Id && selectedMethod === 'DECISION'
                            ? '#F5C518'
                            : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#000' }}>DEC</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ flex: 1 }} />
              )}
            </View>
          </View>

          {/* Percentages below bar chart */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>
              {winnerPredictions.fighter1.percentage}% {fighter1Name}
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>
              {winnerPredictions.fighter2.percentage}% {fighter2Name}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
