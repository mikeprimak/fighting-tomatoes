import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { getHypeHeatmapColor } from '../utils/heatmap';

interface HypeDistributionChartProps {
  // Distribution of hype scores 1-10
  distribution: Record<number, number>;
  totalPredictions: number;
  hasRevealedHype: boolean; // Only show colored bars if user has made hype prediction
  fadeAnim: Animated.Value; // Shared fade animation value from parent (initial reveal)
}

/**
 * HypeDistributionChart - Displays distribution of community hype scores
 * Horizontal bar chart with hype score (1-10) on X-axis and count on Y-axis
 */
export default function HypeDistributionChart({
  distribution,
  totalPredictions,
  hasRevealedHype,
  fadeAnim,
}: HypeDistributionChartProps) {
  // Chart dimensions - horizontal layout
  const chartWidth = 296; // Width for 10 bars - wider to fill space
  const chartHeight = 55; // Compact height
  const barWidth = 8; // Horizontal thickness of bars - slightly thicker
  const barGap = 2;

  // Find max count for scaling
  const maxCount = Math.max(...Object.values(distribution), 1);

  // Create bars for hype scores 1-10 (left to right)
  const bars = [];
  for (let hype = 1; hype <= 10; hype++) {
    const count = distribution[hype] || 0;
    const barHeight = maxCount > 0 ? (count / maxCount) * (chartHeight - 10) : 0;
    const color = getHypeHeatmapColor(hype); // Use correct heatmap colors

    bars.push(
      <View
        key={hype}
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          width: (chartWidth - 20) / 10, // Divide width by 10 scores
          marginRight: hype < 10 ? barGap : 0,
          position: 'relative',
          height: chartHeight - 10,
        }}
      >
        {/* Grey circle - always visible at bottom */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#808080',
          }}
        />

        {/* Colored bar - grows upward when revealed */}
        {hasRevealedHype && count > 0 && (
          <Animated.View
            style={{
              width: barWidth,
              height: barHeight,
              backgroundColor: color,
              borderRadius: 1,
              opacity: fadeAnim,
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Chart area - bars from left (1) to right (10) */}
      <View style={styles.chartArea}>
        {bars}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 55,
    width: 296,
  },
  chartArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingBottom: 5,
  },
});
