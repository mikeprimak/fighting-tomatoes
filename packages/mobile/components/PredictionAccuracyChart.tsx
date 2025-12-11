import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

interface EventAccuracy {
  eventId: string;
  eventName: string;
  eventDate: string;
  correct: number;
  incorrect: number;
}

interface PredictionAccuracyChartProps {
  data: EventAccuracy[];
  totalCorrect: number;
  totalIncorrect: number;
}

/**
 * Diverging Bar Chart showing prediction accuracy per event
 * Green bars go up for correct predictions
 * Red bars go down for incorrect predictions
 */
export default function PredictionAccuracyChart({
  data,
  totalCorrect,
  totalIncorrect,
}: PredictionAccuracyChartProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No prediction data yet
        </Text>
      </View>
    );
  }

  // Find max value for scaling
  const maxValue = Math.max(
    ...data.map(d => Math.max(d.correct, d.incorrect)),
    1
  );

  const barMaxHeight = 72; // Max height for bars in each direction (with padding)
  const barWidth = Math.min(20, (280 - (data.length - 1) * 4) / data.length); // Adaptive width

  // Generate y-axis tick values (0, mid, max for each direction)
  const midValue = Math.ceil(maxValue / 2);

  return (
    <View style={styles.container}>
      {/* Events label at top center */}
      <Text style={[styles.eventsLabel, { color: colors.textSecondary }]}>
        Events
      </Text>

      {/* Chart area */}
      <View style={styles.chartContainer}>
        {/* Y-axis with labels and tick numbers */}
        <View style={styles.yAxisContainer}>
          {/* Correct label (rotated) */}
          <View style={[styles.yAxisLabelTop]}>
            <Text style={[styles.yAxisLabel, { color: colors.textSecondary, transform: [{ rotate: '-90deg' }] }]}>
              Correct
            </Text>
          </View>

          {/* Tick numbers for upper section */}
          <Text style={[styles.yAxisTick, styles.yAxisTickMax, { color: colors.textSecondary }]}>
            {maxValue}
          </Text>
          <Text style={[styles.yAxisTick, styles.yAxisTickMidUpper, { color: colors.textSecondary }]}>
            {midValue}
          </Text>

          {/* Center zero */}
          <Text style={[styles.yAxisTick, styles.yAxisTickCenter, { color: colors.textSecondary }]}>
            0
          </Text>

          {/* Tick numbers for lower section */}
          <Text style={[styles.yAxisTick, styles.yAxisTickMidLower, { color: colors.textSecondary }]}>
            {midValue}
          </Text>
          <Text style={[styles.yAxisTick, styles.yAxisTickMin, { color: colors.textSecondary }]}>
            {maxValue}
          </Text>

          <View style={[styles.yAxisLine, { backgroundColor: colors.border }]} />

          {/* Incorrect label (rotated) */}
          <View style={[styles.yAxisLabelBottom]}>
            <Text style={[styles.yAxisLabel, { color: colors.textSecondary, transform: [{ rotate: '-90deg' }] }]}>
              Incorrect
            </Text>
          </View>
        </View>

        {/* Center line */}
        <View style={[styles.centerLine, { backgroundColor: colors.border }]} />

        {/* Bars container */}
        <View style={styles.barsContainer}>
          {data.map((event, index) => {
            const correctHeight = (event.correct / maxValue) * barMaxHeight;
            const incorrectHeight = (event.incorrect / maxValue) * barMaxHeight;

            return (
              <View
                key={event.eventId}
                style={[styles.barColumn, { width: barWidth }]}
              >
                {/* Correct (green) - goes up */}
                <View style={styles.upperSection}>
                  {event.correct > 0 && (
                    <View
                      style={[
                        styles.bar,
                        styles.correctBar,
                        { height: correctHeight, width: barWidth - 2 },
                      ]}
                    />
                  )}
                </View>

                {/* Incorrect (red) - goes down */}
                <View style={styles.lowerSection}>
                  {event.incorrect > 0 && (
                    <View
                      style={[
                        styles.bar,
                        styles.incorrectBar,
                        { height: incorrectHeight, width: barWidth - 2 },
                      ]}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Event labels - show names vertically */}
      <View style={styles.labelsContainer}>
        {data.map((event, index) => {
          // Extract event label from name
          // "UFC 310" -> "UFC 310", "UFC Fight Night: Tsarukyan vs Hooker" -> "Tsarukyan vs Hooker"
          let label: string;
          const numberMatch = event.eventName.match(/UFC\s+(\d+)/i);
          if (numberMatch) {
            // Numbered events: "UFC 310" -> "UFC 310"
            label = `UFC ${numberMatch[1]}`;
          } else {
            // For "UFC Fight Night: X vs Y", extract "X vs Y"
            const fightNightMatch = event.eventName.match(/:\s*(.+)$/);
            if (fightNightMatch) {
              label = fightNightMatch[1].trim();
            } else {
              // Fallback: remove "UFC" and "Fight Night" prefixes
              label = event.eventName
                .replace(/^UFC\s*/i, '')
                .replace(/^Fight\s*Night\s*/i, '')
                .trim() || event.eventName;
            }
          }

          return (
            <View key={event.eventId} style={[styles.labelWrapper, { width: barWidth }]}>
              <Text
                style={[styles.eventLabel, { color: colors.textSecondary, transform: [{ rotate: '-90deg' }] }]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    marginLeft: -10,
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  eventsLabel: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  chartContainer: {
    height: 176, // 88px up + 88px down
    position: 'relative',
    flexDirection: 'row',
  },
  yAxisContainer: {
    width: 36,
    height: '100%',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 4,
  },
  yAxisLine: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 1,
  },
  yAxisLabel: {
    fontSize: 11,
    textAlign: 'center',
    width: 60,
  },
  yAxisLabelTop: {
    position: 'absolute',
    top: 30,
    right: -6,
  },
  yAxisLabelBottom: {
    position: 'absolute',
    bottom: 30,
    right: -6,
  },
  yAxisTick: {
    position: 'absolute',
    fontSize: 8,
    right: 4,
    textAlign: 'right',
  },
  yAxisTickMax: {
    top: 16,
  },
  yAxisTickMidUpper: {
    top: 52,
  },
  yAxisTickCenter: {
    top: 84,
  },
  yAxisTickMidLower: {
    top: 120,
  },
  yAxisTickMin: {
    top: 156,
  },
  centerLine: {
    position: 'absolute',
    left: 36,
    right: 0,
    top: 88,
    height: 1,
  },
  barsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    height: '100%',
    paddingLeft: 8,
    paddingRight: 4,
    gap: 8,
  },
  barColumn: {
    height: '100%',
    alignItems: 'center',
  },
  upperSection: {
    height: 88,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 16,
  },
  lowerSection: {
    height: 88,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingBottom: 16,
  },
  bar: {
  },
  correctBar: {
    backgroundColor: '#166534', // Green
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  incorrectBar: {
    backgroundColor: '#991B1B', // Dark red to match #166534 green
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  labelsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingLeft: 44, // 36px for y-axis + 8px padding (matches bar gap)
    marginTop: 8,
    gap: 8,
    height: 80,
  },
  labelWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
    height: 80,
  },
  eventLabel: {
    fontSize: 11,
    width: 80,
    textAlign: 'right',
    marginTop: 36,
  },
});
