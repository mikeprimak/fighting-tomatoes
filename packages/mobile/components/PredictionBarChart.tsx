import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';

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
  // Actual outcome (for completed fights)
  actualWinner?: string | null;
  actualMethod?: string | null;
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
  actualWinner,
  actualMethod,
}: PredictionBarChartProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // If no colors revealed, show grey outline only with invisible placeholders
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
        {/* Invisible placeholders to reserve space for percentage names */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 14, opacity: 0 }}>
            0% {fighter1Name}
          </Text>
          <Text style={{ fontSize: 14, opacity: 0 }}>
            0% {fighter2Name}
          </Text>
        </View>
      </View>
    );
  }

  // Determine which side has higher prediction percentage
  const fighter1HasMajority = winnerPredictions.fighter1.percentage > winnerPredictions.fighter2.percentage;
  const fighter2HasMajority = winnerPredictions.fighter2.percentage > winnerPredictions.fighter1.percentage;

  // Calculate background colors
  const fighter1BgColor = fighter1HasMajority ? '#83B4F3' : (colorScheme === 'dark' ? '#2A2A2A' : '#F5F5F5');
  const fighter2BgColor = fighter2HasMajority ? '#83B4F3' : (colorScheme === 'dark' ? '#2A2A2A' : '#F5F5F5');

  return (
    <View style={styles.container}>
      {/* Community Predictions Bar - progressive reveal */}
      {winnerPredictions && (
        <View style={{ flex: 1 }}>
          {/* Percentages above bar chart */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                {winnerPredictions.fighter1.percentage}% {fighter1Name}
              </Text>
              {selectedWinner === fighter1Id && !selectedMethod && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 2,
                    backgroundColor: '#F5C518',
                  }}
                />
              )}
            </View>
            <View>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                {winnerPredictions.fighter2.percentage}% {fighter2Name}
              </Text>
              {selectedWinner === fighter2Id && !selectedMethod && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 2,
                    backgroundColor: '#F5C518',
                  }}
                />
              )}
            </View>
          </View>

          {/* Checkmark overlay - positioned above the bar chart */}
          {actualWinner && actualMethod && (
            <View style={{ height: 28, marginBottom: -14, zIndex: 10, overflow: 'visible' }}>
              <View style={{ flexDirection: 'row', height: 28, overflow: 'visible' }}>
                {/* Fighter 1 checkmark area */}
                <View style={{ flex: winnerPredictions.fighter1.percentage, flexDirection: 'row', overflow: 'visible' }}>
                  {actualWinner === fighter1Id && fighter1Predictions && (
                    <>
                      {actualMethod === 'KO_TKO' && fighter1Predictions.KO_TKO > 0 && (
                        <View style={{ flex: fighter1Predictions.KO_TKO, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 2 }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                            <FontAwesome name="check-circle" size={24} color="#22c55e" solid />
                          </View>
                        </View>
                      )}
                      {actualMethod === 'KO_TKO' && fighter1Predictions.SUBMISSION > 0 && (
                        <View style={{ flex: fighter1Predictions.SUBMISSION }} />
                      )}
                      {actualMethod === 'KO_TKO' && fighter1Predictions.DECISION > 0 && (
                        <View style={{ flex: fighter1Predictions.DECISION }} />
                      )}

                      {actualMethod === 'SUBMISSION' && fighter1Predictions.KO_TKO > 0 && (
                        <View style={{ flex: fighter1Predictions.KO_TKO }} />
                      )}
                      {actualMethod === 'SUBMISSION' && fighter1Predictions.SUBMISSION > 0 && (
                        <View style={{ flex: fighter1Predictions.SUBMISSION, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 2 }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                            <FontAwesome name="check-circle" size={24} color="#22c55e" solid />
                          </View>
                        </View>
                      )}
                      {actualMethod === 'SUBMISSION' && fighter1Predictions.DECISION > 0 && (
                        <View style={{ flex: fighter1Predictions.DECISION }} />
                      )}

                      {actualMethod === 'DECISION' && fighter1Predictions.KO_TKO > 0 && (
                        <View style={{ flex: fighter1Predictions.KO_TKO }} />
                      )}
                      {actualMethod === 'DECISION' && fighter1Predictions.SUBMISSION > 0 && (
                        <View style={{ flex: fighter1Predictions.SUBMISSION }} />
                      )}
                      {actualMethod === 'DECISION' && fighter1Predictions.DECISION > 0 && (
                        <View style={{ flex: fighter1Predictions.DECISION, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 2 }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                            <FontAwesome name="check-circle" size={24} color="#22c55e" solid />
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>

                {/* Fighter 2 checkmark area */}
                <View style={{ flex: winnerPredictions.fighter2.percentage, flexDirection: 'row', overflow: 'visible' }}>
                  {actualWinner === fighter2Id && fighter2Predictions && (
                    <>
                      {actualMethod === 'KO_TKO' && fighter2Predictions.KO_TKO > 0 && (
                        <View style={{ flex: fighter2Predictions.KO_TKO, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 2 }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                            <FontAwesome name="check-circle" size={24} color="#22c55e" solid />
                          </View>
                        </View>
                      )}
                      {actualMethod === 'KO_TKO' && fighter2Predictions.SUBMISSION > 0 && (
                        <View style={{ flex: fighter2Predictions.SUBMISSION }} />
                      )}
                      {actualMethod === 'KO_TKO' && fighter2Predictions.DECISION > 0 && (
                        <View style={{ flex: fighter2Predictions.DECISION }} />
                      )}

                      {actualMethod === 'SUBMISSION' && fighter2Predictions.KO_TKO > 0 && (
                        <View style={{ flex: fighter2Predictions.KO_TKO }} />
                      )}
                      {actualMethod === 'SUBMISSION' && fighter2Predictions.SUBMISSION > 0 && (
                        <View style={{ flex: fighter2Predictions.SUBMISSION, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 2 }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                            <FontAwesome name="check-circle" size={24} color="#22c55e" solid />
                          </View>
                        </View>
                      )}
                      {actualMethod === 'SUBMISSION' && fighter2Predictions.DECISION > 0 && (
                        <View style={{ flex: fighter2Predictions.DECISION }} />
                      )}

                      {actualMethod === 'DECISION' && fighter2Predictions.KO_TKO > 0 && (
                        <View style={{ flex: fighter2Predictions.KO_TKO }} />
                      )}
                      {actualMethod === 'DECISION' && fighter2Predictions.SUBMISSION > 0 && (
                        <View style={{ flex: fighter2Predictions.SUBMISSION }} />
                      )}
                      {actualMethod === 'DECISION' && fighter2Predictions.DECISION > 0 && (
                        <View style={{ flex: fighter2Predictions.DECISION, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 2 }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                            <FontAwesome name="check-circle" size={24} color="#22c55e" solid />
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>
            </View>
          )}

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
                backgroundColor: fighter1BgColor,
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
                        backgroundColor: 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          color: fighter1HasMajority ? '#000' : '#FFF',
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
                        backgroundColor: 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          color: fighter1HasMajority ? '#000' : '#FFF',
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
                        backgroundColor: 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          color: fighter1HasMajority ? '#000' : '#FFF',
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
                backgroundColor: fighter2BgColor,
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
                        backgroundColor: 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '600', color: fighter2HasMajority ? '#000' : '#FFF' }}>KO</Text>
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
                        backgroundColor: 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '600', color: fighter2HasMajority ? '#000' : '#FFF' }}>SUB</Text>
                    </View>
                  )}
                  {fighter2Predictions.DECISION > 0 && (
                    <View
                      style={{
                        flex: fighter2Predictions.DECISION,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '600', color: fighter2HasMajority ? '#000' : '#FFF' }}>DEC</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ flex: 1 }} />
              )}
            </View>
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
