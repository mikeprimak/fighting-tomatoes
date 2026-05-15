import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { getHypeHeatmapColor } from '../utils/heatmap';
import { GLOW_LAYERS } from './HypeDistributionChart';

interface RatingDistributionChartProps {
  // Distribution of rating scores 1-10
  distribution: Record<number, number>;
  totalRatings: number;
  // When set, that bar gets a soft glow halo and its legend number is white/bold.
  userRating?: number | null;
  // Optional override; falls back to the legacy 281px chart width.
  width?: number;
  // Optional shared fade animation for the reveal modal use-case.
  fadeAnim?: Animated.Value;
}

/**
 * RatingDistributionChart - Displays distribution of community rating scores
 * Horizontal bar chart with rating score (1-10) on X-axis and count on Y-axis
 * Always visible (no reveal animation for completed fights)
 */
export default function RatingDistributionChart({
  distribution,
  totalRatings,
  userRating,
  width,
  fadeAnim,
}: RatingDistributionChartProps) {
  const chartWidth = width ?? 281;
  const chartHeight = 50;
  // Flex columns mirror HypeDistributionChart so caller-provided widths don't
  // overflow the chart area.
  const barWidth = Math.min(24, Math.max(12, Math.floor((chartWidth - 20) / 10) - 2));

  const maxCount = Math.max(...Object.values(distribution), 1);

  const bars = [];
  for (let rating = 1; rating <= 10; rating++) {
    const count = distribution[rating] || 0;
    const barHeight = maxCount > 0 ? (count / maxCount) * (chartHeight - 10) : 0;
    const color = getHypeHeatmapColor(rating);
    const isUserBar = userRating != null && rating === userRating;

    bars.push(
      <View
        key={rating}
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          position: 'relative',
          height: chartHeight - 10,
        }}
      >
        {count > 0 && (
          <View style={{ width: barWidth, height: barHeight, position: 'relative' }}>
            {isUserBar && GLOW_LAYERS.map((layer, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  top: -layer.inset,
                  left: -layer.inset,
                  right: -layer.inset,
                  bottom: -layer.inset,
                  borderRadius: layer.inset + 1,
                  backgroundColor: `rgba(255,255,255,${layer.opacity})`,
                }}
              />
            ))}
            <Animated.View
              style={{
                width: barWidth,
                height: barHeight,
                backgroundColor: color,
                borderRadius: 1,
                ...(fadeAnim ? { opacity: fadeAnim } : {}),
                ...(isUserBar
                  ? {
                      shadowColor: '#FFFFFF',
                      shadowOpacity: 1,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 0 },
                    }
                  : {}),
              }}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: chartWidth }]}>
      <View style={styles.chartArea}>
        {bars}
      </View>
      <View style={styles.legendArea}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
          const isUserBar = userRating != null && num === userRating;
          return (
            <View
              key={num}
              style={{
                flex: 1,
                alignItems: 'center',
              }}
            >
              <Text style={[styles.legendText, isUserBar && styles.legendTextUser]}>{num}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    width: 281,
  },
  chartArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    height: 50,
  },
  legendArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginTop: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#808080',
    textAlign: 'center',
  },
  legendTextUser: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
