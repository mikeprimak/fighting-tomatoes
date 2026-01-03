import React from 'react';
import { View, Text, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { getFighterImageUrl } from './fight-cards/shared/utils';

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
      predictions: number;
      percentage: number;
    };
    fighter2: {
      predictions: number;
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

  // Determine which fighter won (for coloring based on actual outcome)
  const fighter1IsActualWinner = actualWinner === fighter1Id;
  const fighter2IsActualWinner = actualWinner === fighter2Id;
  const hasWinner = !!actualWinner;

  // Determine majority for pre-fight fallback
  const fighter1HasMajority = winnerPredictions.fighter1.percentage > winnerPredictions.fighter2.percentage;
  const fighter2HasMajority = winnerPredictions.fighter2.percentage > winnerPredictions.fighter1.percentage;
  const isTie = winnerPredictions.fighter1.percentage === winnerPredictions.fighter2.percentage;

  // Calculate which side gets the green fill:
  // - If fight has a winner: winner side gets green
  // - If pre-fight (no winner): majority side gets green
  const winnerColor = '#166534';
  const fighter1IsGreenSide = hasWinner ? fighter1IsActualWinner : (fighter1HasMajority || isTie);
  const fighter2IsGreenSide = hasWinner ? fighter2IsActualWinner : fighter2HasMajority;
  const fighter1BgColor = fighter1IsGreenSide ? winnerColor : 'transparent';
  const fighter2BgColor = fighter2IsGreenSide ? winnerColor : 'transparent';
  const fighter1IsWinnerSide = fighter1IsGreenSide;
  const fighter2IsWinnerSide = fighter2IsGreenSide;

  // Divider color - solid grey with hint of green matching Predictions container bg
  // Container uses rgba(34, 197, 94, 0.05) on dark bg, rgba(34, 197, 94, 0.08) on light
  const dividerColor = colorScheme === 'dark' ? '#1a2a1a' : '#e8f5e8';

  return (
    <View style={styles.container}>
      {/* Community Predictions Bar - progressive reveal */}
      {winnerPredictions && (
        <View style={{ flex: 1 }}>
          {/* MY PICK Divider - only show if user made a prediction */}
          {selectedWinner && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <View style={{ paddingHorizontal: 12 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>MY PICK</Text>
              </View>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>
          )}

          {/* Both fighter images - user's pick has gold ring and indicators */}
          {(() => {
            const imageSize = 90;
            const goldColor = '#F5C518';
            const isWinnerCorrect = hasWinner && actualWinner === selectedWinner;
            const isMethodCorrect = isWinnerCorrect && actualMethod === selectedMethod;
            const hasMethodPrediction = !!selectedMethod;

            const formatMethodLabel = (method: string | undefined) => {
              if (!method) return '';
              if (method === 'KO_TKO') return 'KO';
              if (method === 'SUBMISSION') return 'SUB';
              if (method === 'DECISION') return 'DEC';
              return method;
            };

            return (
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12, alignItems: 'flex-end' }}>
                {/* Fighter 1 */}
                {(() => {
                  const isUserPick = selectedWinner === fighter1Id;
                  return (
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <View style={{ position: 'relative' }}>
                        <View style={{
                          borderWidth: 3,
                          borderColor: isUserPick ? goldColor : 'transparent',
                          borderRadius: (imageSize + 6) / 2,
                          padding: 2,
                        }}>
                          <Image
                            source={
                              getFighterImageUrl(fighter1Image)
                                ? { uri: getFighterImageUrl(fighter1Image)! }
                                : getFighterPlaceholder()
                            }
                            style={{
                              width: imageSize,
                              height: imageSize,
                              borderRadius: imageSize / 2,
                            }}
                          />
                        </View>
                        {/* Correctness indicator */}
                        {isUserPick && hasWinner && (
                          <View style={{
                            position: 'absolute',
                            bottom: -4,
                            right: 2,
                            backgroundColor: isWinnerCorrect ? '#4CAF50' : '#F44336',
                            borderRadius: 12,
                            width: 24,
                            height: 24,
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: colorScheme === 'dark' ? '#1a1a1a' : '#ffffff',
                          }}>
                            <FontAwesome
                              name={isWinnerCorrect ? 'check' : 'times'}
                              size={14}
                              color="#FFFFFF"
                            />
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', textAlign: 'center', marginTop: 8 }}>
                        {fighter1Name}
                      </Text>
                      {/* Method badge - reserve space for alignment */}
                      {hasMethodPrediction && (
                        <View style={{
                          marginTop: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          backgroundColor: isUserPick
                            ? (hasWinner ? (isMethodCorrect ? '#4CAF50' : 'rgba(255,255,255,0.15)') : goldColor)
                            : 'transparent',
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          opacity: isUserPick ? 1 : 0,
                        }}>
                          <Text style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: isUserPick ? (hasWinner && !isMethodCorrect ? '#FFFFFF' : (hasWinner ? '#FFFFFF' : '#000000')) : 'transparent',
                          }}>
                            {formatMethodLabel(selectedMethod)}
                          </Text>
                          {hasWinner && isUserPick && (
                            <FontAwesome
                              name={isMethodCorrect ? 'check' : 'times'}
                              size={10}
                              color={isMethodCorrect ? '#FFFFFF' : 'rgba(255,255,255,0.6)'}
                            />
                          )}
                        </View>
                      )}
                    </View>
                  );
                })()}
                {/* Fighter 2 */}
                {(() => {
                  const isUserPick = selectedWinner === fighter2Id;
                  return (
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <View style={{ position: 'relative' }}>
                        <View style={{
                          borderWidth: 3,
                          borderColor: isUserPick ? goldColor : 'transparent',
                          borderRadius: (imageSize + 6) / 2,
                          padding: 2,
                        }}>
                          <Image
                            source={
                              getFighterImageUrl(fighter2Image)
                                ? { uri: getFighterImageUrl(fighter2Image)! }
                                : getFighterPlaceholder()
                            }
                            style={{
                              width: imageSize,
                              height: imageSize,
                              borderRadius: imageSize / 2,
                            }}
                          />
                        </View>
                        {/* Correctness indicator */}
                        {isUserPick && hasWinner && (
                          <View style={{
                            position: 'absolute',
                            bottom: -4,
                            right: 2,
                            backgroundColor: isWinnerCorrect ? '#4CAF50' : '#F44336',
                            borderRadius: 12,
                            width: 24,
                            height: 24,
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: colorScheme === 'dark' ? '#1a1a1a' : '#ffffff',
                          }}>
                            <FontAwesome
                              name={isWinnerCorrect ? 'check' : 'times'}
                              size={14}
                              color="#FFFFFF"
                            />
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', textAlign: 'center', marginTop: 8 }}>
                        {fighter2Name}
                      </Text>
                      {/* Method badge - reserve space for alignment */}
                      {hasMethodPrediction && (
                        <View style={{
                          marginTop: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          backgroundColor: isUserPick
                            ? (hasWinner ? (isMethodCorrect ? '#4CAF50' : 'rgba(255,255,255,0.15)') : goldColor)
                            : 'transparent',
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          opacity: isUserPick ? 1 : 0,
                        }}>
                          <Text style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: isUserPick ? (hasWinner && !isMethodCorrect ? '#FFFFFF' : (hasWinner ? '#FFFFFF' : '#000000')) : 'transparent',
                          }}>
                            {formatMethodLabel(selectedMethod)}
                          </Text>
                          {hasWinner && isUserPick && (
                            <FontAwesome
                              name={isMethodCorrect ? 'check' : 'times'}
                              size={10}
                              color={isMethodCorrect ? '#FFFFFF' : 'rgba(255,255,255,0.6)'}
                            />
                          )}
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            );
          })()}

          {/* CROWD PICKS Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <View style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>CROWD PICKS ({totalPredictions})</Text>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Fighter percentages */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8, alignItems: 'center' }}>
            {/* Fighter 1 percentage */}
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>
                {winnerPredictions.fighter1.percentage}%
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' }}>
                {fighter1Name}
              </Text>
            </View>
            {/* Fighter 2 percentage */}
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}>
                {winnerPredictions.fighter2.percentage}%
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' }}>
                {fighter2Name}
              </Text>
            </View>
          </View>

          <View
            style={{
              height: 72,
              flexDirection: 'row',
              borderRadius: 20,
              borderWidth: 2,
              borderColor: dividerColor,
              marginTop: 20,
              marginBottom: 10,
              overflow: 'hidden',
            }}
          >
            {/* Fighter 1 side */}
            <View
              style={{
                flex: winnerPredictions.fighter1.percentage,
                flexDirection: 'row',
                backgroundColor: fighter1BgColor,
                // Add border for loser side (top, left, bottom only - not right)
                borderTopWidth: !fighter1IsWinnerSide ? 2 : 0,
                borderLeftWidth: !fighter1IsWinnerSide ? 2 : 0,
                borderBottomWidth: !fighter1IsWinnerSide ? 2 : 0,
                borderColor: !fighter1IsWinnerSide ? winnerColor : 'transparent',
                // Only show right border if fighter2 has predictions (for winner side), none for loser
                borderRightWidth: fighter1IsWinnerSide && winnerPredictions.fighter2.percentage > 0 ? 2 : 0,
                borderRightColor: fighter1IsWinnerSide ? dividerColor : 'transparent',
                // Round left corners if fighter1 has predictions
                borderTopLeftRadius: winnerPredictions.fighter1.percentage > 0 ? 18 : 0,
                borderBottomLeftRadius: winnerPredictions.fighter1.percentage > 0 ? 18 : 0,
                // Round right corners only if fighter2 has no predictions (fighter1 is the full bar)
                borderTopRightRadius: winnerPredictions.fighter2.percentage === 0 ? 18 : 0,
                borderBottomRightRadius: winnerPredictions.fighter2.percentage === 0 ? 18 : 0,
              }}
            >
              {/* Fighter 1 method subdivisions - show if labels revealed or as plain bars */}
              {fighter1Predictions && showLabels ? (
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  {(() => {
                    // Calculate unspecified as difference between winner predictions and method totals
                    const methodTotal = fighter1Predictions.KO_TKO + fighter1Predictions.SUBMISSION + fighter1Predictions.DECISION;
                    const unspecifiedCount = Math.max(0, winnerPredictions.fighter1.predictions - methodTotal);
                    // Text is white for both majority and minority
                    const textColor = '#FFFFFF';
                    // Use total predictions WITH a winner as denominator (not totalPredictions which includes hype-only)
                    const totalWithWinner = winnerPredictions.fighter1.predictions + winnerPredictions.fighter2.predictions;
                    const methods = [
                      { key: 'KO_TKO', count: fighter1Predictions.KO_TKO, shortLabel: 'K', longLabel: 'KO', methodKey: 'KO_TKO' },
                      { key: 'SUBMISSION', count: fighter1Predictions.SUBMISSION, shortLabel: 'S', longLabel: 'SUB', methodKey: 'SUBMISSION' },
                      { key: 'DECISION', count: fighter1Predictions.DECISION, shortLabel: 'D', longLabel: 'DEC', methodKey: 'DECISION' },
                      { key: 'UNSPECIFIED', count: unspecifiedCount, shortLabel: '?', longLabel: '?', methodKey: 'UNSPECIFIED' },
                    ].filter(m => m.count > 0);

                    return methods.map((method, index) => {
                      // Calculate percentage relative to predictions with a winner (so percentages add up to 100%)
                      const methodPercentage = totalWithWinner > 0 ? (method.count / totalWithWinner) * 100 : 0;
                      // Use overall percentage for label sizing (determines visual width)
                      const label = methodPercentage < 10 ? method.shortLabel : method.longLabel;
                      const isActualOutcome = actualWinner === fighter1Id && actualMethod === method.methodKey;
                      const isLastMethod = index === methods.length - 1;

                      // On winner's side with actual outcome: matching method = full opacity, others = 0.5 opacity
                      // On pre-fight (no winner): all methods on green side get full opacity
                      const methodBgColor = fighter1IsWinnerSide
                        ? (hasWinner ? (isActualOutcome ? winnerColor : 'rgba(22, 101, 52, 0.5)') : winnerColor)
                        : 'transparent';

                      return (
                        <View
                          key={method.key}
                          style={{
                            flex: method.count,
                            justifyContent: 'center',
                            alignItems: 'center',
                            backgroundColor: methodBgColor,
                            borderRightWidth: isLastMethod ? 0 : 2,
                            borderRightColor: fighter1IsWinnerSide ? dividerColor : winnerColor,
                          }}
                        >
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
                // Add border for loser side (top, right, bottom only - not left)
                borderTopWidth: !fighter2IsWinnerSide ? 2 : 0,
                borderRightWidth: !fighter2IsWinnerSide ? 2 : 0,
                borderBottomWidth: !fighter2IsWinnerSide ? 2 : 0,
                borderLeftWidth: 0,
                borderColor: !fighter2IsWinnerSide ? winnerColor : 'transparent',
                // Round right corners if fighter2 has predictions
                borderTopRightRadius: winnerPredictions.fighter2.percentage > 0 ? 18 : 0,
                borderBottomRightRadius: winnerPredictions.fighter2.percentage > 0 ? 18 : 0,
                // Round left corners only if fighter1 has no predictions (fighter2 is the full bar)
                borderTopLeftRadius: winnerPredictions.fighter1.percentage === 0 ? 18 : 0,
                borderBottomLeftRadius: winnerPredictions.fighter1.percentage === 0 ? 18 : 0,
              }}
            >
              {/* Fighter 2 method subdivisions - show if labels revealed or as plain bars */}
              {fighter2Predictions && showLabels ? (
                <View style={{ flexDirection: 'row', flex: 1 }}>
                  {(() => {
                    // Calculate unspecified as difference between winner predictions and method totals
                    const methodTotal = fighter2Predictions.KO_TKO + fighter2Predictions.SUBMISSION + fighter2Predictions.DECISION;
                    const unspecifiedCount = Math.max(0, winnerPredictions.fighter2.predictions - methodTotal);
                    // Text is white for both majority and minority
                    const textColor = '#FFFFFF';
                    // Use total predictions WITH a winner as denominator (not totalPredictions which includes hype-only)
                    const totalWithWinner = winnerPredictions.fighter1.predictions + winnerPredictions.fighter2.predictions;
                    const methods = [
                      { key: 'KO_TKO', count: fighter2Predictions.KO_TKO, shortLabel: 'K', longLabel: 'KO', methodKey: 'KO_TKO' },
                      { key: 'SUBMISSION', count: fighter2Predictions.SUBMISSION, shortLabel: 'S', longLabel: 'SUB', methodKey: 'SUBMISSION' },
                      { key: 'DECISION', count: fighter2Predictions.DECISION, shortLabel: 'D', longLabel: 'DEC', methodKey: 'DECISION' },
                      { key: 'UNSPECIFIED', count: unspecifiedCount, shortLabel: '?', longLabel: '?', methodKey: 'UNSPECIFIED' },
                    ].filter(m => m.count > 0);

                    return methods.map((method, index) => {
                      // Calculate percentage relative to predictions with a winner (so percentages add up to 100%)
                      const methodPercentage = totalWithWinner > 0 ? (method.count / totalWithWinner) * 100 : 0;
                      // Use overall percentage for label sizing (determines visual width)
                      const label = methodPercentage < 10 ? method.shortLabel : method.longLabel;
                      const isActualOutcome = actualWinner === fighter2Id && actualMethod === method.methodKey;
                      const isLastMethod = index === methods.length - 1;

                      // On winner's side with actual outcome: matching method = full opacity, others = 0.5 opacity
                      // On pre-fight (no winner): all methods on green side get full opacity
                      const methodBgColor = fighter2IsWinnerSide
                        ? (hasWinner ? (isActualOutcome ? winnerColor : 'rgba(22, 101, 52, 0.5)') : winnerColor)
                        : 'transparent';

                      return (
                        <View
                          key={method.key}
                          style={{
                            flex: method.count,
                            justifyContent: 'center',
                            alignItems: 'center',
                            backgroundColor: methodBgColor,
                            borderRightWidth: isLastMethod ? 0 : 2,
                            borderRightColor: fighter2IsWinnerSide ? dividerColor : winnerColor,
                          }}
                        >
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
