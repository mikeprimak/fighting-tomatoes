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
    UNSPECIFIED?: number;
  };
  fighter2Predictions: {
    KO_TKO: number;
    SUBMISSION: number;
    DECISION: number;
    UNSPECIFIED?: number;
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
            height: 72,
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
  const isTie = winnerPredictions.fighter1.percentage === winnerPredictions.fighter2.percentage;

  // Calculate background colors
  // Majority side gets full blue (#83B4F3), minority side gets muted blue
  // In case of a tie (50/50), fighter1 gets light blue, fighter2 gets muted blue for visual distinction
  const minorityBgColor = colorScheme === 'dark' ? '#28323F' : '#d4e3f5';
  const fighter1BgColor = (fighter1HasMajority || isTie) ? '#83B4F3' : minorityBgColor;
  const fighter2BgColor = fighter2HasMajority ? '#83B4F3' : minorityBgColor;

  // Divider color - solid grey with hint of blue matching Community Data container bg
  // Container uses rgba(59, 130, 246, 0.05) on dark bg, rgba(59, 130, 246, 0.08) on light
  const dividerColor = colorScheme === 'dark' ? '#1a2230' : '#e8eef5';

  return (
    <View style={styles.container}>
      {/* Community Predictions Bar - progressive reveal */}
      {winnerPredictions && (
        <View style={{ flex: 1 }}>
          {/* Picks Section Divider */}
          <View style={styles.sectionDivider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 4 }} />
              <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>
                Winner Predictions ({totalPredictions})
              </Text>
              <View style={{ width: 4 }} />
            </View>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

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
              height: 72,
              flexDirection: 'row',
              borderRadius: 20,
              borderWidth: 2,
              borderColor: dividerColor,
              marginTop: 20,
              marginBottom: 10,
            }}
          >
            {/* Fighter 1 side */}
            <View
              style={{
                flex: winnerPredictions.fighter1.percentage,
                flexDirection: 'row',
                backgroundColor: fighter1BgColor,
                // Only show right border if fighter2 has predictions
                borderRightWidth: winnerPredictions.fighter2.percentage > 0 ? 2 : 0,
                borderRightColor: dividerColor,
                borderTopLeftRadius: 18,
                borderBottomLeftRadius: 18,
                // If fighter1 has 100%, also round the right corners
                borderTopRightRadius: winnerPredictions.fighter1.percentage === 100 ? 18 : 0,
                borderBottomRightRadius: winnerPredictions.fighter1.percentage === 100 ? 18 : 0,
              }}
            >
              {/* Fighter 1 method subdivisions - show if labels revealed or as plain bars */}
              {fighter1Predictions && showLabels ? (
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  {(() => {
                    // Calculate fighter1's total predictions for method percentages (including unspecified)
                    const unspecifiedCount = fighter1Predictions.UNSPECIFIED || 0;
                    const fighter1Total = fighter1Predictions.KO_TKO + fighter1Predictions.SUBMISSION + fighter1Predictions.DECISION + unspecifiedCount;
                    // Text is dark on light blue bg (majority or tie), light blue on dark bg (minority)
                    const textColor = (fighter1HasMajority || isTie) ? '#000' : '#83B4F3';
                    const methods = [
                      { key: 'KO_TKO', count: fighter1Predictions.KO_TKO, shortLabel: 'K', longLabel: 'KO', methodKey: 'KO_TKO' },
                      { key: 'SUBMISSION', count: fighter1Predictions.SUBMISSION, shortLabel: 'S', longLabel: 'SUB', methodKey: 'SUBMISSION' },
                      { key: 'DECISION', count: fighter1Predictions.DECISION, shortLabel: 'D', longLabel: 'DEC', methodKey: 'DECISION' },
                      { key: 'UNSPECIFIED', count: unspecifiedCount, shortLabel: '?', longLabel: '?', methodKey: 'UNSPECIFIED' },
                    ].filter(m => m.count > 0);

                    return methods.map((method, index) => {
                      // Calculate percentage relative to OVERALL total predictions
                      const methodPercentage = totalPredictions > 0 ? (method.count / totalPredictions) * 100 : 0;
                      // Use overall percentage for label sizing (determines visual width)
                      const label = methodPercentage < 10 ? method.shortLabel : method.longLabel;
                      const isUserPrediction = selectedWinner === fighter1Id && selectedMethod === method.methodKey;
                      const isActualOutcome = actualWinner === fighter1Id && actualMethod === method.methodKey;
                      const isLastMethod = index === methods.length - 1;

                      return (
                        <View
                          key={method.key}
                          style={{
                            flex: method.count,
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderRightWidth: isLastMethod ? 0 : 2,
                            borderRightColor: dividerColor,
                          }}
                        >
                          {isUserPrediction && (
                            <View style={[styles.userPredictionIndicator, { backgroundColor: '#F5C518' }]}>
                              <FontAwesome name="user" size={16} color="#000000" />
                            </View>
                          )}
                          {isActualOutcome && (
                            <View style={[styles.actualOutcomeIndicator, { backgroundColor: '#10b981' }]}>
                              <FontAwesome name="check" size={14} color="#FFFFFF" />
                            </View>
                          )}
                          <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>
                            {label}
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '500', color: textColor }}>
                            {Math.round(methodPercentage)}%
                          </Text>
                        </View>
                      );
                    });
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
                // If fighter2 has 100%, also round the left corners
                borderTopLeftRadius: winnerPredictions.fighter2.percentage === 100 ? 18 : 0,
                borderBottomLeftRadius: winnerPredictions.fighter2.percentage === 100 ? 18 : 0,
              }}
            >
              {/* Fighter 2 method subdivisions - show if labels revealed or as plain bars */}
              {fighter2Predictions && showLabels ? (
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  {(() => {
                    // Calculate fighter2's total predictions for method percentages (including unspecified)
                    const unspecifiedCount = fighter2Predictions.UNSPECIFIED || 0;
                    const fighter2Total = fighter2Predictions.KO_TKO + fighter2Predictions.SUBMISSION + fighter2Predictions.DECISION + unspecifiedCount;
                    const textColor = fighter2HasMajority ? '#000' : '#83B4F3';
                    const methods = [
                      { key: 'KO_TKO', count: fighter2Predictions.KO_TKO, shortLabel: 'K', longLabel: 'KO', methodKey: 'KO_TKO' },
                      { key: 'SUBMISSION', count: fighter2Predictions.SUBMISSION, shortLabel: 'S', longLabel: 'SUB', methodKey: 'SUBMISSION' },
                      { key: 'DECISION', count: fighter2Predictions.DECISION, shortLabel: 'D', longLabel: 'DEC', methodKey: 'DECISION' },
                      { key: 'UNSPECIFIED', count: unspecifiedCount, shortLabel: '?', longLabel: '?', methodKey: 'UNSPECIFIED' },
                    ].filter(m => m.count > 0);

                    return methods.map((method, index) => {
                      // Calculate percentage relative to OVERALL total predictions
                      const methodPercentage = totalPredictions > 0 ? (method.count / totalPredictions) * 100 : 0;
                      // Use overall percentage for label sizing (determines visual width)
                      const label = methodPercentage < 10 ? method.shortLabel : method.longLabel;
                      const isUserPrediction = selectedWinner === fighter2Id && selectedMethod === method.methodKey;
                      const isActualOutcome = actualWinner === fighter2Id && actualMethod === method.methodKey;
                      const isLastMethod = index === methods.length - 1;

                      return (
                        <View
                          key={method.key}
                          style={{
                            flex: method.count,
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderRightWidth: isLastMethod ? 0 : 2,
                            borderRightColor: dividerColor,
                          }}
                        >
                          {isUserPrediction && (
                            <View style={[styles.userPredictionIndicator, { backgroundColor: '#F5C518' }]}>
                              <FontAwesome name="user" size={16} color="#000000" />
                            </View>
                          )}
                          {isActualOutcome && (
                            <View style={[styles.actualOutcomeIndicator, { backgroundColor: '#10b981' }]}>
                              <FontAwesome name="check" size={14} color="#FFFFFF" />
                            </View>
                          )}
                          <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>
                            {label}
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '500', color: textColor }}>
                            {Math.round(methodPercentage)}%
                          </Text>
                        </View>
                      );
                    });
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
  actualOutcomeIndicator: {
    position: 'absolute',
    bottom: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
