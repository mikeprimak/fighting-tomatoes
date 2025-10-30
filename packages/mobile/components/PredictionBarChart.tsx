import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { getHypeHeatmapColor } from '../utils/heatmap';

interface PredictionStats {
  totalPredictions: number;
  averageHype: number;
  winnerPredictions: {
    fighter1: { count: number; percentage: number };
    fighter2: { count: number; percentage: number };
  };
  fighter1MethodPredictions: {
    KO_TKO: number;
    SUBMISSION: number;
    DECISION: number;
  };
  fighter2MethodPredictions: {
    KO_TKO: number;
    SUBMISSION: number;
    DECISION: number;
  };
}

interface PredictionBarChartProps {
  predictionStats: PredictionStats;
  fighter1Name: string;
  fighter2Name: string;
}

export default function PredictionBarChart({
  predictionStats,
  fighter1Name,
  fighter2Name,
}: PredictionBarChartProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (!predictionStats || predictionStats.totalPredictions === 0) {
    return null;
  }

  const renderBarSegment = (
    method: 'KO_TKO' | 'SUBMISSION' | 'DECISION',
    count: number,
    totalPredictions: number
  ) => {
    const widthPercent = (count / totalPredictions) * 100;

    // Determine text based on width
    let text = '';
    if (method === 'KO_TKO') {
      if (widthPercent > 10) text = 'KO';
      else if (widthPercent > 5) text = 'K';
    } else if (method === 'SUBMISSION') {
      if (widthPercent > 10) text = 'SUB';
      else if (widthPercent > 5) text = 'S';
    } else if (method === 'DECISION') {
      if (widthPercent > 10) text = 'DEC';
      else if (widthPercent > 5) text = 'D';
    }

    // Determine background color
    let backgroundColor = '#F5C518'; // KO/TKO - full yellow
    if (method === 'SUBMISSION') backgroundColor = '#F5C518CC'; // 80% opacity
    if (method === 'DECISION') backgroundColor = '#F5C5184D'; // 30% opacity

    return (
      <View
        key={method}
        style={[
          styles.barSegment,
          {
            width: `${widthPercent}%`,
            backgroundColor,
          }
        ]}
      >
        {text !== '' && (
          <Text style={styles.barSegmentText}>{text}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.chartContainer}>
      {/* Fighter 1 Bar */}
      <View style={styles.chartRow}>
        <Text style={[styles.fighterLabel, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
          {fighter1Name}
        </Text>
        <View style={styles.barContainer}>
          <View style={styles.stackedBar}>
            {renderBarSegment('KO_TKO', predictionStats.fighter1MethodPredictions.KO_TKO, predictionStats.totalPredictions)}
            {renderBarSegment('SUBMISSION', predictionStats.fighter1MethodPredictions.SUBMISSION, predictionStats.totalPredictions)}
            {renderBarSegment('DECISION', predictionStats.fighter1MethodPredictions.DECISION, predictionStats.totalPredictions)}
          </View>
          <Text style={[styles.percentageLabel, { color: colors.text }]}>
            {predictionStats.winnerPredictions.fighter1.percentage.toFixed(0)}%
          </Text>
        </View>
      </View>

      {/* Fighter 2 Bar */}
      <View style={styles.chartRow}>
        <Text style={[styles.fighterLabel, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
          {fighter2Name}
        </Text>
        <View style={styles.barContainer}>
          <View style={styles.stackedBar}>
            {renderBarSegment('KO_TKO', predictionStats.fighter2MethodPredictions.KO_TKO, predictionStats.totalPredictions)}
            {renderBarSegment('SUBMISSION', predictionStats.fighter2MethodPredictions.SUBMISSION, predictionStats.totalPredictions)}
            {renderBarSegment('DECISION', predictionStats.fighter2MethodPredictions.DECISION, predictionStats.totalPredictions)}
          </View>
          <Text style={[styles.percentageLabel, { color: colors.text }]}>
            {predictionStats.winnerPredictions.fighter2.percentage.toFixed(0)}%
          </Text>
        </View>
      </View>

      {/* Hype Row */}
      <View style={styles.chartRow}>
        <Text style={[styles.fighterLabel, { color: colors.text }]}>
          Hype
        </Text>
        <View style={styles.barContainer}>
          <FontAwesome6
            name="fire-flame-curved"
            size={20}
            color={getHypeHeatmapColor(predictionStats.averageHype || 0)}
          />
          <Text style={[styles.hypeChartValue, { color: colors.text }]}>
            {predictionStats.averageHype !== undefined
              ? predictionStats.averageHype % 1 === 0
                ? predictionStats.averageHype.toString()
                : predictionStats.averageHype.toFixed(1)
              : '0'}
          </Text>
          <Text style={[styles.hypeChartCount, { color: colors.textSecondary }]}>
            ({predictionStats.totalPredictions || 0})
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    marginTop: 4,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  fighterLabel: {
    fontSize: 14,
    fontWeight: '500',
    width: 100,
  },
  barContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stackedBar: {
    flex: 1,
    height: 24,
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barSegment: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  barSegmentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
  },
  percentageLabel: {
    fontSize: 14,
    fontWeight: '600',
    width: 40,
    textAlign: 'right',
  },
  hypeChartValue: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  hypeChartCount: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
});
