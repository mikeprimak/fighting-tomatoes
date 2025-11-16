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
 * Vertical bar chart with hype score (1-10) on Y-axis and count on X-axis
 */
export default function HypeDistributionChart({
  distribution,
  totalPredictions,
  hasRevealedHype,
  fadeAnim,
}: HypeDistributionChartProps) {
  // Chart dimensions - match pie chart height (160px)
  const chartHeight = 160;
  const chartWidth = 83; // 74px + 9px = 83px total (increased horizontal extent)
  const barWidth = 6; // Vertical thickness of bars (back to original)
  const barGap = 1;

  // Find max count for scaling
  const maxCount = Math.max(...Object.values(distribution), 1);

  // Create bars for hype scores 1-10 (bottom to top)
  const bars = [];
  for (let hype = 1; hype <= 10; hype++) {
    const count = distribution[hype] || 0;
    const barHeight = maxCount > 0 ? (count / maxCount) * (chartWidth - 10) : 0;
    const color = getHypeHeatmapColor(hype); // Use correct heatmap colors

    bars.push(
      <View
        key={hype}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: (chartHeight - 20) / 10, // Divide height by 10 scores
          marginBottom: hype < 10 ? barGap : 0,
          position: 'relative',
        }}
      >
        {/* Grey circle - always visible */}
        <View
          style={{
            position: 'absolute',
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#808080',
          }}
        />

        {/* Colored bar - fades in on top when revealed */}
        {hasRevealedHype && count > 0 && (
          <Animated.View
            style={{
              position: 'absolute',
              width: barHeight,
              height: barWidth,
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
      {/* Chart area - bars from bottom (1) to top (10) */}
      <View style={styles.chartArea}>
        {bars.reverse()} {/* Reverse to show 10 at top, 1 at bottom */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 160,
    width: 83, // Increased by 9px for wider horizontal bars
  },
  chartArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
});
