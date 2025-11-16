import React from 'react';
import { View, Text as RNText, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G, Text } from 'react-native-svg';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

interface PredictionPieChartProps {
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
}

/**
 * PredictionPieChart - Displays community predictions as a pie chart
 * Shows winner split and method subdivisions for each fighter
 */
export default function PredictionPieChart({
  fighter1Name,
  fighter2Name,
  fighter1Id,
  fighter2Id,
  selectedWinner,
  selectedMethod,
  fighter1Predictions,
  fighter2Predictions,
  totalPredictions,
}: PredictionPieChartProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Calculate total predictions for each fighter
  const fighter1Total = fighter1Predictions.KO_TKO + fighter1Predictions.SUBMISSION + fighter1Predictions.DECISION;
  const fighter2Total = fighter2Predictions.KO_TKO + fighter2Predictions.SUBMISSION + fighter2Predictions.DECISION;

  // Chart configuration
  const size = 160; // Diameter of pie chart (66% of 240)
  const radius = size / 2;
  const centerX = radius;
  const centerY = radius;

  // Calculate percentages
  const fighter1Percentage = totalPredictions > 0 ? Math.round((fighter1Total / totalPredictions) * 100) : 0;
  const fighter2Percentage = totalPredictions > 0 ? Math.round((fighter2Total / totalPredictions) * 100) : 0;

  // Helper function to mix color with red tint
  const mixWithRed = (baseColor: string): string => {
    // Parse base color (hex)
    const hexMatch = baseColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!hexMatch) return baseColor;

    const baseR = parseInt(hexMatch[1], 16);
    const baseG = parseInt(hexMatch[2], 16);
    const baseB = parseInt(hexMatch[3], 16);

    // Red tint is #FF0000 (255, 0, 0)
    const redR = 255;
    const redG = 0;
    const redB = 0;

    // Mix 90% base + 10% red for mild tint
    const mixedR = Math.round(baseR * 0.9 + redR * 0.1);
    const mixedG = Math.round(baseG * 0.9 + redG * 0.1);
    const mixedB = Math.round(baseB * 0.9 + redB * 0.1);

    return `#${mixedR.toString(16).padStart(2, '0')}${mixedG.toString(16).padStart(2, '0')}${mixedB.toString(16).padStart(2, '0')}`;
  };

  // Method colors for Fighter 1 (darker shades with mild red tint)
  const baseColors = {
    KO_TKO: colorScheme === 'dark' ? '#1a1a1a' : '#e0e0e0',
    SUBMISSION: colorScheme === 'dark' ? '#2a2a2a' : '#d0d0d0',
    DECISION: colorScheme === 'dark' ? '#3a3a3a' : '#c0c0c0',
  };

  const fighter1Colors = {
    KO_TKO: mixWithRed(baseColors.KO_TKO),
    SUBMISSION: mixWithRed(baseColors.SUBMISSION),
    DECISION: mixWithRed(baseColors.DECISION),
  };

  // Helper function to mix color with blue tint
  const mixWithBlue = (baseColor: string): string => {
    // Parse base color (hex)
    const hexMatch = baseColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!hexMatch) return baseColor;

    const baseR = parseInt(hexMatch[1], 16);
    const baseG = parseInt(hexMatch[2], 16);
    const baseB = parseInt(hexMatch[3], 16);

    // Blue tint is #0000FF (0, 0, 255)
    const blueR = 0;
    const blueG = 0;
    const blueB = 255;

    // Mix 90% base + 10% blue for mild tint
    const mixedR = Math.round(baseR * 0.9 + blueR * 0.1);
    const mixedG = Math.round(baseG * 0.9 + blueG * 0.1);
    const mixedB = Math.round(baseB * 0.9 + blueB * 0.1);

    return `#${mixedR.toString(16).padStart(2, '0')}${mixedG.toString(16).padStart(2, '0')}${mixedB.toString(16).padStart(2, '0')}`;
  };

  // Method colors for Fighter 2 (same base colors but with 10% blue tint)
  const fighter2Colors = {
    KO_TKO: mixWithBlue(baseColors.KO_TKO),
    SUBMISSION: mixWithBlue(baseColors.SUBMISSION),
    DECISION: mixWithBlue(baseColors.DECISION),
  };

  // Helper function to create SVG path for a pie slice (full solid pie)
  const createPieSlice = (
    startAngle: number,
    endAngle: number,
    color: string,
    isHighlighted: boolean
  ): string => {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

    return `
      M ${centerX},${centerY}
      L ${start.x},${start.y}
      A ${radius},${radius} 0 ${largeArcFlag} 0 ${end.x},${end.y}
      Z
    `;
  };

  // Helper function to convert polar coordinates to cartesian
  // Start from top (0 degrees) so chart is split vertically
  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0; // Start from top (12 o'clock)
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  // Helper function to get label position (at the middle of the slice)
  const getLabelPosition = (startAngle: number, endAngle: number) => {
    const midAngle = (startAngle + endAngle) / 2;
    const labelRadius = radius * 0.65; // Position label at 65% of radius
    return polarToCartesian(centerX, centerY, labelRadius, midAngle);
  };

  // Helper function to get method label
  const getMethodLabel = (method: string): string => {
    if (method === 'KO_TKO') return 'KO';
    if (method === 'SUBMISSION') return 'SUB';
    if (method === 'DECISION') return 'DEC';
    return '';
  };

  // Build pie slices data
  const slices: Array<{
    startAngle: number;
    endAngle: number;
    color: string;
    isHighlighted: boolean;
    method: string;
    fighterId: string;
    count: number;
  }> = [];

  let currentAngle = 0;

  // Fighter 2 slices (draw first - will appear on LEFT side)
  if (fighter2Predictions.KO_TKO > 0) {
    const angle = (fighter2Predictions.KO_TKO / totalPredictions) * 360;
    slices.push({
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: fighter2Colors.KO_TKO,
      isHighlighted: selectedWinner === fighter2Id && selectedMethod === 'KO_TKO',
      method: 'KO_TKO',
      fighterId: fighter2Id,
      count: fighter2Predictions.KO_TKO,
    });
    currentAngle += angle;
  }

  if (fighter2Predictions.SUBMISSION > 0) {
    const angle = (fighter2Predictions.SUBMISSION / totalPredictions) * 360;
    slices.push({
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: fighter2Colors.SUBMISSION,
      isHighlighted: selectedWinner === fighter2Id && selectedMethod === 'SUBMISSION',
      method: 'SUBMISSION',
      fighterId: fighter2Id,
      count: fighter2Predictions.SUBMISSION,
    });
    currentAngle += angle;
  }

  if (fighter2Predictions.DECISION > 0) {
    const angle = (fighter2Predictions.DECISION / totalPredictions) * 360;
    slices.push({
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: fighter2Colors.DECISION,
      isHighlighted: selectedWinner === fighter2Id && selectedMethod === 'DECISION',
      method: 'DECISION',
      fighterId: fighter2Id,
      count: fighter2Predictions.DECISION,
    });
    currentAngle += angle;
  }

  // Fighter 1 slices (draw second - will appear on RIGHT side)
  if (fighter1Predictions.KO_TKO > 0) {
    const angle = (fighter1Predictions.KO_TKO / totalPredictions) * 360;
    slices.push({
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: fighter1Colors.KO_TKO,
      isHighlighted: selectedWinner === fighter1Id && selectedMethod === 'KO_TKO',
      method: 'KO_TKO',
      fighterId: fighter1Id,
      count: fighter1Predictions.KO_TKO,
    });
    currentAngle += angle;
  }

  if (fighter1Predictions.SUBMISSION > 0) {
    const angle = (fighter1Predictions.SUBMISSION / totalPredictions) * 360;
    slices.push({
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: fighter1Colors.SUBMISSION,
      isHighlighted: selectedWinner === fighter1Id && selectedMethod === 'SUBMISSION',
      method: 'SUBMISSION',
      fighterId: fighter1Id,
      count: fighter1Predictions.SUBMISSION,
    });
    currentAngle += angle;
  }

  if (fighter1Predictions.DECISION > 0) {
    const angle = (fighter1Predictions.DECISION / totalPredictions) * 360;
    slices.push({
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: fighter1Colors.DECISION,
      isHighlighted: selectedWinner === fighter1Id && selectedMethod === 'DECISION',
      method: 'DECISION',
      fighterId: fighter1Id,
      count: fighter1Predictions.DECISION,
    });
    currentAngle += angle;
  }

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        {/* Fighter percentages at top left and top right */}
        <View style={styles.legendTop}>
        <View style={{ flexShrink: 1, marginRight: 8 }}>
          <RNText style={[styles.legendText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">
            {fighter1Percentage}% {fighter1Name}
          </RNText>
          <View style={styles.underlineRed} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <RNText style={[styles.legendText, styles.legendTextRight, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">
            {fighter2Percentage}% {fighter2Name}
          </RNText>
          <View style={styles.underlineBlue} />
        </View>
      </View>

      <View style={styles.chartWrapper}>
        <Svg width={size} height={size}>
        <G>
          {/* Draw pie slices */}
          {slices.map((slice, index) => {
            const labelPos = getLabelPosition(slice.startAngle, slice.endAngle);
            const sliceAngle = slice.endAngle - slice.startAngle;

            return (
              <G key={`slice-${index}`}>
                {/* Pie slice */}
                <Path
                  d={createPieSlice(slice.startAngle, slice.endAngle, slice.color, slice.isHighlighted)}
                  fill={slice.color}
                  stroke="#FFFFFF"
                  strokeWidth={1}
                  strokeOpacity={0.2}
                />

                {/* Label text - only show if slice is large enough (> 15 degrees) */}
                {sliceAngle > 15 && (
                  <Text
                    x={labelPos.x - (slice.isHighlighted ? 6 : 0)}
                    y={labelPos.y}
                    fill="#FFFFFF"
                    fontSize="16"
                    fontWeight="bold"
                    textAnchor="middle"
                    alignmentBaseline="middle"
                  >
                    {getMethodLabel(slice.method)}
                  </Text>
                )}
              </G>
            );
          })}

          {/* Draw all user icons on top layer */}
          {slices.map((slice, index) => {
            const labelPos = getLabelPosition(slice.startAngle, slice.endAngle);
            const sliceAngle = slice.endAngle - slice.startAngle;

            return slice.isHighlighted && sliceAngle > 15 ? (
              <Path
                key={`icon-${index}`}
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                fill="#F5C518"
                transform={`translate(${labelPos.x + 8}, ${labelPos.y - 12}) scale(0.83)`}
              />
            ) : null;
          })}
        </G>
      </Svg>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, // Take remaining space in parent row
  },
  innerContainer: {
    marginLeft: 30, // Offset from aggregate hype box
  },
  legendTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendText: {
    fontSize: 16,
    fontWeight: '600',
  },
  legendTextRight: {
    textAlign: 'right', // Align right fighter name to the right
  },
  underlineRed: {
    width: 50,
    height: 2,
    backgroundColor: '#FF0000',
    alignSelf: 'center',
    marginTop: 2,
  },
  underlineBlue: {
    width: 50,
    height: 2,
    backgroundColor: '#0000FF',
    alignSelf: 'center',
    marginTop: 2,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
