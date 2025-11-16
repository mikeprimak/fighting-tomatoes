import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

interface HypeDistributionChartProps {
  // Distribution of hype scores 1-10
  distribution: Record<number, number>;
  totalPredictions: number;
}

/**
 * HypeDistributionChart - Displays distribution of community hype scores
 * Vertical bar chart with hype score (1-10) on Y-axis and count on X-axis
 */
export default function HypeDistributionChart({
  distribution,
  totalPredictions,
}: HypeDistributionChartProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Chart dimensions - match pie chart height (160px)
  const chartHeight = 160;
  const chartWidth = 51; // User icon (11px) + gap (11px) + hype box (40px) = 62px, reduced to 51
  const barWidth = 4;
  const barGap = 1;

  // Find max count for scaling
  const maxCount = Math.max(...Object.values(distribution), 1);

  // Helper function to get hype color
  const getHypeColor = (hype: number): string => {
    if (hype >= 9) return '#00FF00'; // Bright green
    if (hype >= 8) return '#7FFF00'; // Yellow-green
    if (hype >= 7) return '#FFFF00'; // Yellow
    if (hype >= 6) return '#FFD700'; // Gold
    if (hype >= 5) return '#FFA500'; // Orange
    if (hype >= 4) return '#FF8C00'; // Dark orange
    if (hype >= 3) return '#FF6347'; // Tomato
    if (hype >= 2) return '#FF4500'; // Orange-red
    return '#FF0000'; // Red
  };

  // Create bars for hype scores 1-10 (bottom to top)
  const bars = [];
  for (let hype = 1; hype <= 10; hype++) {
    const count = distribution[hype] || 0;
    const barHeight = maxCount > 0 ? (count / maxCount) * (chartWidth - 10) : 0;
    const color = getHypeColor(hype);

    bars.push(
      <View
        key={hype}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: (chartHeight - 20) / 10, // Divide height by 10 scores
          marginBottom: hype < 10 ? barGap : 0,
        }}
      >
        {/* Hype score label on left */}
        <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
          {hype}
        </Text>

        {/* Bar */}
        <View
          style={{
            width: barHeight,
            height: barWidth,
            backgroundColor: color,
            marginLeft: 4,
            borderRadius: 1,
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Y-axis label */}
      <View style={styles.yAxisLabel}>
        <Text style={[styles.axisText, { color: colors.textSecondary }]}>
          Hype
        </Text>
      </View>

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
    width: 51,
  },
  yAxisLabel: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  axisText: {
    fontSize: 10,
    fontWeight: '600',
    transform: [{ rotate: '-90deg' }],
  },
  chartArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '500',
    width: 12,
    textAlign: 'right',
  },
});
