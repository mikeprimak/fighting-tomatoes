import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { getHypeHeatmapColor } from '../utils/heatmap';

// Approximation of a Gaussian-blur box-shadow: 14 stacked translucent white
// layers, each 1px further out, with exponential opacity decay. Cross-platform
// (works the same on Android where shadowColor is ignored).
const GLOW_LAYERS = Array.from({ length: 14 }, (_, i) => {
  const inset = i + 1;
  // Peak ~0.32 at the innermost layer, decays to ~0.01 at the outer edge.
  const opacity = 0.32 * Math.exp(-i / 4.2);
  return { inset, opacity: Math.round(opacity * 1000) / 1000 };
});

interface HypeDistributionChartProps {
  // Distribution of hype scores 1-10
  distribution: Record<number, number>;
  totalPredictions: number;
  hasRevealedHype: boolean; // Only show colored bars if user has made hype prediction
  fadeAnim: Animated.Value; // Shared fade animation value from parent (initial reveal)
  userHype?: number | null; // When set, that bar gets a soft glow halo
  width?: number; // Optional override; falls back to the legacy 281px chart width
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
  userHype,
  width,
}: HypeDistributionChartProps) {
  // Chart dimensions - horizontal layout (matches RatingDistributionChart)
  const chartWidth = width ?? 281; // Allow caller to constrain to fit smaller containers
  const chartHeight = 50; // Height for bars area
  // Each column uses flex:1 instead of an explicit width so the 10 bars + gaps
  // distribute perfectly inside the chartArea content zone — eliminates the
  // ~9px right-edge overflow the prior fixed-width layout produced, which was
  // making the modal appear wider than the hype modal once the halo extended
  // past the chart's right side.
  const barWidth = Math.min(24, Math.max(12, Math.floor((chartWidth - 20) / 10) - 2));

  // Find max count for scaling
  const maxCount = Math.max(...Object.values(distribution), 1);

  // Create bars for hype scores 1-10 (left to right)
  const bars = [];
  for (let hype = 1; hype <= 10; hype++) {
    const count = distribution[hype] || 0;
    const barHeight = maxCount > 0 ? (count / maxCount) * (chartHeight - 10) : 0;
    const color = getHypeHeatmapColor(hype); // Use correct heatmap colors
    const isUserBar = userHype != null && hype === userHype;

    bars.push(
      <View
        key={hype}
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          position: 'relative',
          height: chartHeight - 10,
        }}
      >
        {/* Colored bar — grows upward when revealed.
            User's own bar is wrapped with layered translucent halos that
            create a soft white radial glow fading outward (works on both
            iOS and Android, where shadowColor isn't customizable). */}
        {hasRevealedHype && count > 0 && (
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
                opacity: fadeAnim,
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
      {/* Chart area - bars from left (1) to right (10) */}
      <View style={styles.chartArea}>
        {bars}
      </View>
      {/* Legend - numbers 1-10. User's number rendered white + bold.
          flex:1 columns mirror the chartArea layout above so the numbers
          land directly under their bars. */}
      <View style={styles.legendArea}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
          const isUserBar = userHype != null && num === userHype;
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