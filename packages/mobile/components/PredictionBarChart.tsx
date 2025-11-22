import React from 'react';
import { View, Text, StyleSheet, Alert, Image, ImageSourcePropType } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';

interface PredictionBarChartProps {
  fighter1Name: string;
  fighter2Name: string;
  fighter1Id: string;
  fighter2Id: string;
  fighter1Image?: string | null;
  fighter2Image?: string | null;
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
  fighter1Image,
  fighter2Image,
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

  // Placeholder image - use default fighter image if no image available
  const getFighterPlaceholder = () => {
    return require('../assets/fighters/fighter-default-alpha.png');
  };

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
  const fighter1BgColor = fighter1HasMajority ? '#83B4F3' : (colorScheme === 'dark' ? '#3A3A3A' : '#6B7280');
  const fighter2BgColor = fighter2HasMajority ? '#83B4F3' : (colorScheme === 'dark' ? '#3A3A3A' : '#6B7280');

  return (
    <View style={styles.container}>
      {/* Community Predictions Bar - progressive reveal */}
      {winnerPredictions && (
        <View style={{ flex: 1 }}>
          {/* Fighter headshots and percentages above bar chart */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            {/* Fighter 1 */}
            <View style={{ alignItems: 'flex-start' }}>
              <Image
                source={
                  fighter1Image
                    ? { uri: fighter1Image }
                    : getFighterPlaceholder()
                }
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  marginBottom: 4,
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                  {winnerPredictions.fighter1.percentage}% {fighter1Name}
                </Text>
                {selectedWinner === fighter1Id && !selectedMethod && (
                  <FontAwesome name="user" size={12} color="#F5C518" />
                )}
              </View>
            </View>
            {/* Fighter 2 */}
            <View style={{ alignItems: 'flex-end' }}>
              <Image
                source={
                  fighter2Image
                    ? { uri: fighter2Image }
                    : getFighterPlaceholder()
                }
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  marginBottom: 4,
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                  {winnerPredictions.fighter2.percentage}% {fighter2Name}
                </Text>
                {selectedWinner === fighter2Id && !selectedMethod && (
                  <FontAwesome name="user" size={12} color="#F5C518" />
                )}
              </View>
            </View>
          </View>

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
                  {fighter1Predictions.KO_TKO > 0 && (() => {
                    const methodPercentage = (fighter1Predictions.KO_TKO / winnerPredictions.fighter1.count) * 100;
                    const label = methodPercentage < 15 ? 'K' : 'KO';
                    const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === 'KO_TKO';
                    const isActualOutcome = actualWinner === fighter1Id && actualMethod === 'KO_TKO';
                    return (
                      <View
                        style={{
                          flex: fighter1Predictions.KO_TKO,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 1,
                          borderRightColor: colors.border,
                          backgroundColor: 'transparent',
                          position: 'relative',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: fighter1HasMajority ? '#000' : '#FFF',
                          }}
                        >
                          {label}
                        </Text>
                        {(isUserPrediction || isActualOutcome) && (
                          <View style={{
                            position: 'absolute',
                            bottom: 0,
                            flexDirection: 'row',
                            gap: 3,
                          }}>
                            {isUserPrediction && (
                              <FontAwesome name="user" size={10} color="#F5C518" />
                            )}
                            {isActualOutcome && (
                              <View style={{
                                width: 9,
                                height: 9,
                                borderRadius: 4.5,
                                backgroundColor: '#000',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}>
                                <FontAwesome name="check-circle" size={10} color="#4CAF50" />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  {fighter1Predictions.SUBMISSION > 0 && (() => {
                    const methodPercentage = (fighter1Predictions.SUBMISSION / winnerPredictions.fighter1.count) * 100;
                    const label = methodPercentage < 15 ? 'S' : 'SUB';
                    const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === 'SUBMISSION';
                    const isActualOutcome = actualWinner === fighter1Id && actualMethod === 'SUBMISSION';
                    return (
                      <View
                        style={{
                          flex: fighter1Predictions.SUBMISSION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 1,
                          borderRightColor: colors.border,
                          backgroundColor: 'transparent',
                          position: 'relative',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: fighter1HasMajority ? '#000' : '#FFF',
                          }}
                        >
                          {label}
                        </Text>
                        {(isUserPrediction || isActualOutcome) && (
                          <View style={{
                            position: 'absolute',
                            bottom: 0,
                            flexDirection: 'row',
                            gap: 3,
                          }}>
                            {isUserPrediction && (
                              <FontAwesome name="user" size={10} color="#F5C518" />
                            )}
                            {isActualOutcome && (
                              <View style={{
                                width: 9,
                                height: 9,
                                borderRadius: 4.5,
                                backgroundColor: '#000',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}>
                                <FontAwesome name="check-circle" size={10} color="#4CAF50" />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  {fighter1Predictions.DECISION > 0 && (() => {
                    const methodPercentage = (fighter1Predictions.DECISION / winnerPredictions.fighter1.count) * 100;
                    const label = methodPercentage < 15 ? 'D' : 'DEC';
                    const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === 'DECISION';
                    const isActualOutcome = actualWinner === fighter1Id && actualMethod === 'DECISION';
                    return (
                      <View
                        style={{
                          flex: fighter1Predictions.DECISION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          backgroundColor: 'transparent',
                          position: 'relative',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            color: fighter1HasMajority ? '#000' : '#FFF',
                          }}
                        >
                          {label}
                        </Text>
                        {(isUserPrediction || isActualOutcome) && (
                          <View style={{
                            position: 'absolute',
                            bottom: 0,
                            flexDirection: 'row',
                            gap: 3,
                          }}>
                            {isUserPrediction && (
                              <FontAwesome name="user" size={10} color="#F5C518" />
                            )}
                            {isActualOutcome && (
                              <View style={{
                                width: 9,
                                height: 9,
                                borderRadius: 4.5,
                                backgroundColor: '#000',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}>
                                <FontAwesome name="check-circle" size={10} color="#4CAF50" />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}
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
                  {fighter2Predictions.KO_TKO > 0 && (() => {
                    const methodPercentage = (fighter2Predictions.KO_TKO / winnerPredictions.fighter2.count) * 100;
                    const label = methodPercentage < 15 ? 'K' : 'KO';
                    const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === 'KO_TKO';
                    const isActualOutcome = actualWinner === fighter2Id && actualMethod === 'KO_TKO';
                    return (
                      <View
                        style={{
                          flex: fighter2Predictions.KO_TKO,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 1,
                          borderRightColor: colors.border,
                          backgroundColor: 'transparent',
                          position: 'relative',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '600', color: fighter2HasMajority ? '#000' : '#FFF' }}>{label}</Text>
                        {(isUserPrediction || isActualOutcome) && (
                          <View style={{
                            position: 'absolute',
                            bottom: 0,
                            flexDirection: 'row',
                            gap: 3,
                          }}>
                            {isUserPrediction && (
                              <FontAwesome name="user" size={10} color="#F5C518" />
                            )}
                            {isActualOutcome && (
                              <View style={{
                                width: 9,
                                height: 9,
                                borderRadius: 4.5,
                                backgroundColor: '#000',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}>
                                <FontAwesome name="check-circle" size={10} color="#4CAF50" />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  {fighter2Predictions.SUBMISSION > 0 && (() => {
                    const methodPercentage = (fighter2Predictions.SUBMISSION / winnerPredictions.fighter2.count) * 100;
                    const label = methodPercentage < 15 ? 'S' : 'SUB';
                    const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === 'SUBMISSION';
                    const isActualOutcome = actualWinner === fighter2Id && actualMethod === 'SUBMISSION';
                    return (
                      <View
                        style={{
                          flex: fighter2Predictions.SUBMISSION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 1,
                          borderRightColor: colors.border,
                          backgroundColor: 'transparent',
                          position: 'relative',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '600', color: fighter2HasMajority ? '#000' : '#FFF' }}>{label}</Text>
                        {(isUserPrediction || isActualOutcome) && (
                          <View style={{
                            position: 'absolute',
                            bottom: 0,
                            flexDirection: 'row',
                            gap: 3,
                          }}>
                            {isUserPrediction && (
                              <FontAwesome name="user" size={10} color="#F5C518" />
                            )}
                            {isActualOutcome && (
                              <View style={{
                                width: 9,
                                height: 9,
                                borderRadius: 4.5,
                                backgroundColor: '#000',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}>
                                <FontAwesome name="check-circle" size={10} color="#4CAF50" />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  {fighter2Predictions.DECISION > 0 && (() => {
                    const methodPercentage = (fighter2Predictions.DECISION / winnerPredictions.fighter2.count) * 100;
                    const label = methodPercentage < 15 ? 'D' : 'DEC';
                    const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === 'DECISION';
                    const isActualOutcome = actualWinner === fighter2Id && actualMethod === 'DECISION';
                    return (
                      <View
                        style={{
                          flex: fighter2Predictions.DECISION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          backgroundColor: 'transparent',
                          position: 'relative',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '600', color: fighter2HasMajority ? '#000' : '#FFF' }}>{label}</Text>
                        {(isUserPrediction || isActualOutcome) && (
                          <View style={{
                            position: 'absolute',
                            bottom: 0,
                            flexDirection: 'row',
                            gap: 3,
                          }}>
                            {isUserPrediction && (
                              <FontAwesome name="user" size={10} color="#F5C518" />
                            )}
                            {isActualOutcome && (
                              <View style={{
                                width: 9,
                                height: 9,
                                borderRadius: 4.5,
                                backgroundColor: '#000',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}>
                                <FontAwesome name="check-circle" size={10} color="#4CAF50" />
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })()}
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
