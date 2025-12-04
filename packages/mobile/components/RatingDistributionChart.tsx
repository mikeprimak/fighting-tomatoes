import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getHypeHeatmapColor } from '../utils/heatmap';

interface RatingDistributionChartProps {
  // Distribution of rating scores 1-10
  distribution: Record<number, number>;
  totalRatings: number;
}

/**
 * RatingDistributionChart - Displays distribution of community rating scores
 * Horizontal bar chart with rating score (1-10) on X-axis and count on Y-axis
 * Always visible (no reveal animation for completed fights)
 */
export default function RatingDistributionChart({
  distribution,
  totalRatings,
}: RatingDistributionChartProps) {
  // Chart dimensions - horizontal layout
  const chartWidth = 281; // Width for 10 bars - narrower to fit screen
  const chartHeight = 72; // Height for bars area
  const barWidth = 24; // Wider bars that almost touch
  const barGap = 1;

  // Find max count for scaling
  const maxCount = Math.max(...Object.values(distribution), 1);

  // Create bars for rating scores 1-10 (left to right)
  const bars = [];
  for (let rating = 1; rating <= 10; rating++) {
    const count = distribution[rating] || 0;
    const barHeight = maxCount > 0 ? (count / maxCount) * (chartHeight - 10) : 0;
    const color = getHypeHeatmapColor(rating); // Use correct heatmap colors

    bars.push(
      <View
        key={rating}
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          width: (chartWidth - 20) / 10, // Divide width by 10 scores
          marginRight: rating < 10 ? barGap : 0,
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

        {/* Colored bar - grows upward (always visible for completed fights) */}
        {count > 0 && (
          <View
            style={{
              width: barWidth,
              height: barHeight,
              backgroundColor: color,
              borderRadius: 1,
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
      {/* Legend - numbers 1-10 */}
      <View style={styles.legendArea}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <View
            key={num}
            style={{
              width: (chartWidth - 20) / 10,
              marginRight: num < 10 ? barGap : 0,
              alignItems: 'center',
            }}
          >
            <Text style={styles.legendText}>{num}</Text>
          </View>
        ))}
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
    height: 72,
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
});
