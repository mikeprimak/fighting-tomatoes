import React from 'react';
import { View, Text, StyleSheet, Alert, Image, ImageSourcePropType } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

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
            height: 56,
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
  // Majority side gets full blue (#83B4F3), minority side gets same muted blue as Community Data container
  const fighter1BgColor = fighter1HasMajority ? '#83B4F3' : (colorScheme === 'dark' ? 'rgba(131, 180, 243, 0.2)' : 'rgba(131, 180, 243, 0.25)');
  const fighter2BgColor = fighter2HasMajority ? '#83B4F3' : (colorScheme === 'dark' ? 'rgba(131, 180, 243, 0.2)' : 'rgba(131, 180, 243, 0.25)');

  // Divider color - solid grey with hint of blue matching Community Data container bg
  // Container uses rgba(59, 130, 246, 0.05) on dark bg, rgba(59, 130, 246, 0.08) on light
  const dividerColor = colorScheme === 'dark' ? '#1a2230' : '#e8eef5';

  return (
    <View style={styles.container}>
      {/* Community Predictions Bar - progressive reveal */}
      {winnerPredictions && (
        <View style={{ flex: 1 }}>
          {/* Fighter headshots and percentages above bar chart */}
          {(() => {
            // Calculate image sizes based on deviation from 50%
            // This creates more dramatic size differences for closer matchups
            const baseSize = 68;
            const scaleFactor = 0.6; // px per % deviation from 50%
            const fighter1Size = Math.max(48, Math.min(88, baseSize + (winnerPredictions.fighter1.percentage - 50) * scaleFactor));
            const fighter2Size = Math.max(48, Math.min(88, baseSize + (winnerPredictions.fighter2.percentage - 50) * scaleFactor));

            return (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-end' }}>
                {/* Fighter 1 */}
                <View style={{ alignItems: 'flex-start' }}>
                  <View style={fighter1HasMajority ? {
                    borderWidth: 3,
                    borderColor: '#83B4F3',
                    borderRadius: fighter1Size / 2 + 3,
                    padding: 2,
                    marginBottom: 4,
                  } : { marginBottom: 4 }}>
                    <Image
                      source={
                        fighter1Image
                          ? { uri: fighter1Image }
                          : getFighterPlaceholder()
                      }
                      style={{
                        width: fighter1Size,
                        height: fighter1Size,
                        borderRadius: fighter1Size / 2,
                      }}
                    />
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>
                      {winnerPredictions.fighter1.percentage}% {fighter1Name}
                    </Text>
                    {selectedWinner === fighter1Id && !selectedMethod && (
                      <View style={{
                        height: 2,
                        backgroundColor: '#F5C518',
                        borderRadius: 1,
                        marginTop: 2,
                      }} />
                    )}
                  </View>
                </View>
                {/* Fighter 2 */}
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={fighter2HasMajority ? {
                    borderWidth: 3,
                    borderColor: '#83B4F3',
                    borderRadius: fighter2Size / 2 + 3,
                    padding: 2,
                    marginBottom: 4,
                  } : { marginBottom: 4 }}>
                    <Image
                      source={
                        fighter2Image
                          ? { uri: fighter2Image }
                          : getFighterPlaceholder()
                      }
                      style={{
                        width: fighter2Size,
                        height: fighter2Size,
                        borderRadius: fighter2Size / 2,
                      }}
                    />
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>
                      {winnerPredictions.fighter2.percentage}% {fighter2Name}
                    </Text>
                    {selectedWinner === fighter2Id && !selectedMethod && (
                      <View style={{
                        height: 2,
                        backgroundColor: '#F5C518',
                        borderRadius: 1,
                        marginTop: 2,
                      }} />
                    )}
                  </View>
                </View>
              </View>
            );
          })()}

          <View
            style={{
              height: 56,
              flexDirection: 'row',
              borderRadius: 8,
              overflow: 'hidden',
              borderWidth: 2,
              borderColor: dividerColor,
            }}
          >
            {/* Fighter 1 side */}
            <View
              style={{
                flex: winnerPredictions.fighter1.percentage,
                flexDirection: 'row',
                backgroundColor: fighter1BgColor,
                borderRightWidth: 2,
                borderRightColor: dividerColor,
              }}
            >
              {/* Fighter 1 method subdivisions - show if labels revealed or as plain bars */}
              {fighter1Predictions && showLabels ? (
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  {fighter1Predictions.KO_TKO > 0 && (() => {
                    const methodPercentage = (fighter1Predictions.KO_TKO / winnerPredictions.fighter1.count) * 100;
                    const label = methodPercentage < 25 ? 'K' : 'KO';
                    const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === 'KO_TKO';
                    const isActualOutcome = actualWinner === fighter1Id && actualMethod === 'KO_TKO';
                    return (
                      <View
                        style={{
                          flex: fighter1Predictions.KO_TKO,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 2,
                          borderRightColor: dividerColor,
                          backgroundColor: 'transparent',
                        }}
                      >
                        {/* Green overline for actual outcome */}
                        {isActualOutcome && (
                          <View style={{
                            position: 'absolute',
                            top: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#4CAF50',
                            borderRadius: 1,
                          }} />
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: fighter1HasMajority ? '#000' : '#83B4F3',
                          }}
                        >
                          {label}
                        </Text>
                        {/* Yellow underline for user prediction */}
                        {isUserPrediction && (
                          <View style={{
                            position: 'absolute',
                            bottom: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#F5C518',
                            borderRadius: 1,
                          }} />
                        )}
                      </View>
                    );
                  })()}
                  {fighter1Predictions.SUBMISSION > 0 && (() => {
                    const methodPercentage = (fighter1Predictions.SUBMISSION / winnerPredictions.fighter1.count) * 100;
                    const label = methodPercentage < 25 ? 'S' : 'SUB';
                    const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === 'SUBMISSION';
                    const isActualOutcome = actualWinner === fighter1Id && actualMethod === 'SUBMISSION';
                    return (
                      <View
                        style={{
                          flex: fighter1Predictions.SUBMISSION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 2,
                          borderRightColor: dividerColor,
                          backgroundColor: 'transparent',
                        }}
                      >
                        {/* Green overline for actual outcome */}
                        {isActualOutcome && (
                          <View style={{
                            position: 'absolute',
                            top: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#4CAF50',
                            borderRadius: 1,
                          }} />
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: fighter1HasMajority ? '#000' : '#83B4F3',
                          }}
                        >
                          {label}
                        </Text>
                        {/* Yellow underline for user prediction */}
                        {isUserPrediction && (
                          <View style={{
                            position: 'absolute',
                            bottom: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#F5C518',
                            borderRadius: 1,
                          }} />
                        )}
                      </View>
                    );
                  })()}
                  {fighter1Predictions.DECISION > 0 && (() => {
                    const methodPercentage = (fighter1Predictions.DECISION / winnerPredictions.fighter1.count) * 100;
                    const label = methodPercentage < 25 ? 'D' : 'DEC';
                    const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === 'DECISION';
                    const isActualOutcome = actualWinner === fighter1Id && actualMethod === 'DECISION';
                    return (
                      <View
                        style={{
                          flex: fighter1Predictions.DECISION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          backgroundColor: 'transparent',
                        }}
                      >
                        {/* Green overline for actual outcome */}
                        {isActualOutcome && (
                          <View style={{
                            position: 'absolute',
                            top: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#4CAF50',
                            borderRadius: 1,
                          }} />
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: fighter1HasMajority ? '#000' : '#83B4F3',
                          }}
                        >
                          {label}
                        </Text>
                        {/* Yellow underline for user prediction */}
                        {isUserPrediction && (
                          <View style={{
                            position: 'absolute',
                            bottom: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#F5C518',
                            borderRadius: 1,
                          }} />
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
                    const label = methodPercentage < 25 ? 'K' : 'KO';
                    const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === 'KO_TKO';
                    const isActualOutcome = actualWinner === fighter2Id && actualMethod === 'KO_TKO';
                    return (
                      <View
                        style={{
                          flex: fighter2Predictions.KO_TKO,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 2,
                          borderRightColor: dividerColor,
                          backgroundColor: 'transparent',
                        }}
                      >
                        {/* Green overline for actual outcome */}
                        {isActualOutcome && (
                          <View style={{
                            position: 'absolute',
                            top: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#4CAF50',
                            borderRadius: 1,
                          }} />
                        )}
                        <Text style={{ fontSize: 14, fontWeight: '600', color: fighter2HasMajority ? '#000' : '#83B4F3' }}>{label}</Text>
                        {/* Yellow underline for user prediction */}
                        {isUserPrediction && (
                          <View style={{
                            position: 'absolute',
                            bottom: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#F5C518',
                            borderRadius: 1,
                          }} />
                        )}
                      </View>
                    );
                  })()}
                  {fighter2Predictions.SUBMISSION > 0 && (() => {
                    const methodPercentage = (fighter2Predictions.SUBMISSION / winnerPredictions.fighter2.count) * 100;
                    const label = methodPercentage < 25 ? 'S' : 'SUB';
                    const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === 'SUBMISSION';
                    const isActualOutcome = actualWinner === fighter2Id && actualMethod === 'SUBMISSION';
                    return (
                      <View
                        style={{
                          flex: fighter2Predictions.SUBMISSION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 2,
                          borderRightColor: dividerColor,
                          backgroundColor: 'transparent',
                        }}
                      >
                        {/* Green overline for actual outcome */}
                        {isActualOutcome && (
                          <View style={{
                            position: 'absolute',
                            top: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#4CAF50',
                            borderRadius: 1,
                          }} />
                        )}
                        <Text style={{ fontSize: 14, fontWeight: '600', color: fighter2HasMajority ? '#000' : '#83B4F3' }}>{label}</Text>
                        {/* Yellow underline for user prediction */}
                        {isUserPrediction && (
                          <View style={{
                            position: 'absolute',
                            bottom: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#F5C518',
                            borderRadius: 1,
                          }} />
                        )}
                      </View>
                    );
                  })()}
                  {fighter2Predictions.DECISION > 0 && (() => {
                    const methodPercentage = (fighter2Predictions.DECISION / winnerPredictions.fighter2.count) * 100;
                    const label = methodPercentage < 25 ? 'D' : 'DEC';
                    const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === 'DECISION';
                    const isActualOutcome = actualWinner === fighter2Id && actualMethod === 'DECISION';
                    return (
                      <View
                        style={{
                          flex: fighter2Predictions.DECISION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          backgroundColor: 'transparent',
                        }}
                      >
                        {/* Green overline for actual outcome */}
                        {isActualOutcome && (
                          <View style={{
                            position: 'absolute',
                            top: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#4CAF50',
                            borderRadius: 1,
                          }} />
                        )}
                        <Text style={{ fontSize: 14, fontWeight: '600', color: fighter2HasMajority ? '#000' : '#83B4F3' }}>{label}</Text>
                        {/* Yellow underline for user prediction */}
                        {isUserPrediction && (
                          <View style={{
                            position: 'absolute',
                            bottom: 6,
                            left: '25%',
                            right: '25%',
                            height: 2,
                            backgroundColor: '#F5C518',
                            borderRadius: 1,
                          }} />
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
