import React from 'react';
import { View, Text, StyleSheet, Alert, Image, ImageSourcePropType } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';

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
  // Majority side gets full blue (#83B4F3), minority side gets muted blue
  const minorityBgColor = colorScheme === 'dark' ? '#28323F' : '#d4e3f5';
  const fighter1BgColor = fighter1HasMajority ? '#83B4F3' : minorityBgColor;
  const fighter2BgColor = fighter2HasMajority ? '#83B4F3' : minorityBgColor;

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
            // Larger image size, centered layout like Winner section
            const imageSize = 90;

            return (
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8, alignItems: 'flex-end' }}>
                {/* Fighter 1 */}
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <View style={{ marginBottom: 4 }}>
                    <Image
                      source={
                        fighter1Image
                          ? { uri: fighter1Image }
                          : getFighterPlaceholder()
                      }
                      style={{
                        width: imageSize,
                        height: imageSize,
                        borderRadius: imageSize / 2,
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>
                    {winnerPredictions.fighter1.percentage}%
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' }}>
                    {fighter1Name}
                  </Text>
                </View>
                {/* Fighter 2 */}
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <View style={{ marginBottom: 4 }}>
                    <Image
                      source={
                        fighter2Image
                          ? { uri: fighter2Image }
                          : getFighterPlaceholder()
                      }
                      style={{
                        width: imageSize,
                        height: imageSize,
                        borderRadius: imageSize / 2,
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>
                    {winnerPredictions.fighter2.percentage}%
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' }}>
                    {fighter2Name}
                  </Text>
                </View>
              </View>
            );
          })()}

          <View
            style={{
              height: 56,
              flexDirection: 'row',
              borderRadius: 20,
              borderWidth: 2,
              borderColor: dividerColor,
              marginTop: 10,
              marginBottom: 10,
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
                borderTopLeftRadius: 18,
                borderBottomLeftRadius: 18,
              }}
            >
              {/* Fighter 1 method subdivisions - show if labels revealed or as plain bars */}
              {fighter1Predictions && showLabels ? (
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  {fighter1Predictions.KO_TKO > 0 && (() => {
                    const methodPercentage = (fighter1Predictions.KO_TKO / totalPredictions) * 100;
                    const label = methodPercentage < 15 ? 'K' : 'KO';
                    const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === 'KO_TKO';
                    const textColor = fighter1HasMajority ? '#000' : '#83B4F3';
                    return (
                      <View
                        style={{
                          flex: fighter1Predictions.KO_TKO,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 2,
                          borderRightColor: dividerColor,
                        }}
                      >
                        {isUserPrediction && (
                          <View style={[styles.userPredictionIndicator, { backgroundColor: fighter1HasMajority ? '#83B4F3' : minorityBgColor }]}>
                            <FontAwesome name="user" size={16} color="#F5C518" />
                          </View>
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: textColor,
                          }}
                        >
                          {label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '500',
                            color: textColor,
                          }}
                        >
                          {Math.round(methodPercentage)}%
                        </Text>
                      </View>
                    );
                  })()}
                  {fighter1Predictions.SUBMISSION > 0 && (() => {
                    const methodPercentage = (fighter1Predictions.SUBMISSION / totalPredictions) * 100;
                    const label = methodPercentage < 15 ? 'S' : 'SUB';
                    const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === 'SUBMISSION';
                    const textColor = fighter1HasMajority ? '#000' : '#83B4F3';
                    return (
                      <View
                        style={{
                          flex: fighter1Predictions.SUBMISSION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 2,
                          borderRightColor: dividerColor,
                        }}
                      >
                        {isUserPrediction && (
                          <View style={[styles.userPredictionIndicator, { backgroundColor: fighter1HasMajority ? '#83B4F3' : minorityBgColor }]}>
                            <FontAwesome name="user" size={16} color="#F5C518" />
                          </View>
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: textColor,
                          }}
                        >
                          {label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '500',
                            color: textColor,
                          }}
                        >
                          {Math.round(methodPercentage)}%
                        </Text>
                      </View>
                    );
                  })()}
                  {fighter1Predictions.DECISION > 0 && (() => {
                    const methodPercentage = (fighter1Predictions.DECISION / totalPredictions) * 100;
                    const label = methodPercentage < 15 ? 'D' : 'DEC';
                    const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === 'DECISION';
                    const textColor = fighter1HasMajority ? '#000' : '#83B4F3';
                    return (
                      <View
                        style={{
                          flex: fighter1Predictions.DECISION,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {isUserPrediction && (
                          <View style={[styles.userPredictionIndicator, { backgroundColor: fighter1HasMajority ? '#83B4F3' : minorityBgColor }]}>
                            <FontAwesome name="user" size={16} color="#F5C518" />
                          </View>
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: textColor,
                          }}
                        >
                          {label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '500',
                            color: textColor,
                          }}
                        >
                          {Math.round(methodPercentage)}%
                        </Text>
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
                borderTopRightRadius: 18,
                borderBottomRightRadius: 18,
              }}
            >
              {/* Fighter 2 method subdivisions - show if labels revealed or as plain bars */}
              {fighter2Predictions && showLabels ? (
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  {fighter2Predictions.KO_TKO > 0 && (() => {
                    const methodPercentage = (fighter2Predictions.KO_TKO / totalPredictions) * 100;
                    const label = methodPercentage < 15 ? 'K' : 'KO';
                    const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === 'KO_TKO';
                    const textColor = fighter2HasMajority ? '#000' : '#83B4F3';
                    return (
                      <View
                        style={{
                          flex: fighter2Predictions.KO_TKO,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 2,
                          borderRightColor: dividerColor,
                        }}
                      >
                        {isUserPrediction && (
                          <View style={[styles.userPredictionIndicator, { backgroundColor: fighter2HasMajority ? '#83B4F3' : minorityBgColor }]}>
                            <FontAwesome name="user" size={16} color="#F5C518" />
                          </View>
                        )}
                        <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{label}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '500', color: textColor }}>{Math.round(methodPercentage)}%</Text>
                      </View>
                    );
                  })()}
                  {fighter2Predictions.SUBMISSION > 0 && (() => {
                    const methodPercentage = (fighter2Predictions.SUBMISSION / totalPredictions) * 100;
                    const label = methodPercentage < 15 ? 'S' : 'SUB';
                    const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === 'SUBMISSION';
                    const textColor = fighter2HasMajority ? '#000' : '#83B4F3';
                    return (
                      <View
                        style={{
                          flex: fighter2Predictions.SUBMISSION,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderRightWidth: 2,
                          borderRightColor: dividerColor,
                        }}
                      >
                        {isUserPrediction && (
                          <View style={[styles.userPredictionIndicator, { backgroundColor: fighter2HasMajority ? '#83B4F3' : minorityBgColor }]}>
                            <FontAwesome name="user" size={16} color="#F5C518" />
                          </View>
                        )}
                        <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{label}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '500', color: textColor }}>{Math.round(methodPercentage)}%</Text>
                      </View>
                    );
                  })()}
                  {fighter2Predictions.DECISION > 0 && (() => {
                    const methodPercentage = (fighter2Predictions.DECISION / totalPredictions) * 100;
                    const label = methodPercentage < 15 ? 'D' : 'DEC';
                    const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === 'DECISION';
                    const textColor = fighter2HasMajority ? '#000' : '#83B4F3';
                    return (
                      <View
                        style={{
                          flex: fighter2Predictions.DECISION,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {isUserPrediction && (
                          <View style={[styles.userPredictionIndicator, { backgroundColor: fighter2HasMajority ? '#83B4F3' : minorityBgColor }]}>
                            <FontAwesome name="user" size={16} color="#F5C518" />
                          </View>
                        )}
                        <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{label}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '500', color: textColor }}>{Math.round(methodPercentage)}%</Text>
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
  userPredictionIndicator: {
    position: 'absolute',
    top: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
