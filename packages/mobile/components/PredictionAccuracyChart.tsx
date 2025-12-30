import React, { useRef } from 'react';
import { View, Text, StyleSheet, useColorScheme, Pressable, ScrollView } from 'react-native';
import { Colors } from '../constants/Colors';
import { router } from 'expo-router';

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
 * Scrollable horizontally when more than 12 events
 */
const MAX_VISIBLE_EVENTS = 12;
const BAR_WIDTH = 20;
const BAR_GAP = 8;

export default function PredictionAccuracyChart({
  data,
  totalCorrect,
  totalIncorrect,
}: PredictionAccuracyChartProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const scrollViewRef = useRef<ScrollView>(null);

  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No prediction data yet
        </Text>
      </View>
    );
  }

  // Find max value for scaling (use all data)
  const maxValue = Math.max(
    ...data.map(d => Math.max(d.correct, d.incorrect)),
    1
  );

  const barMaxHeight = 72; // Max height for bars in each direction (with padding)
  const isScrollable = data.length > MAX_VISIBLE_EVENTS;

  // Calculate content width for scrollable area
  const contentWidth = data.length * BAR_WIDTH + (data.length - 1) * BAR_GAP + 16; // 16 for padding

  // Generate y-axis tick values (0, mid, max for each direction)
  const midValue = Math.ceil(maxValue / 2);

  return (
    <View style={styles.container}>
      {/* Events label at top center */}
      <Text style={[styles.eventsLabel, { color: colors.textSecondary }]}>
        Events
      </Text>

      {/* Chart area with fixed Y-axis and scrollable bars */}
      <View style={styles.chartWrapper}>
        {/* Y-axis with labels and tick numbers (fixed) */}
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

        {/* Scrollable chart area */}
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={isScrollable}
          scrollEnabled={isScrollable}
          contentContainerStyle={[
            styles.scrollContent,
            { width: isScrollable ? contentWidth : '100%' },
          ]}
        >
          {/* Chart container with bars and labels */}
          <View style={styles.chartContent}>
            {/* Bars area */}
            <View style={styles.chartContainer}>
              {/* Center line */}
              <View style={[styles.centerLine, { backgroundColor: colors.border }]} />

              {/* Bars container */}
              <View style={styles.barsContainer}>
                {data.map((event, index) => {
                  const correctHeight = (event.correct / maxValue) * barMaxHeight;
                  const incorrectHeight = (event.incorrect / maxValue) * barMaxHeight;

                  return (
                    <Pressable
                      key={event.eventId}
                      style={[styles.barColumn, { width: BAR_WIDTH }]}
                      onPress={() => router.push(`/event/${event.eventId}`)}
                    >
                      {({ pressed }) => (
                        <>
                          {/* Correct (green) - goes up */}
                          <View style={styles.upperSection}>
                            {event.correct > 0 && (
                              <View
                                style={[
                                  styles.bar,
                                  styles.correctBar,
                                  { height: correctHeight, width: BAR_WIDTH - 2 },
                                  pressed && { backgroundColor: '#22c55e' },
                                ]}
                              >
                                <Text style={styles.barNumberTop}>{event.correct}</Text>
                              </View>
                            )}
                          </View>

                          {/* Incorrect (red) - goes down */}
                          <View style={styles.lowerSection}>
                            {event.incorrect > 0 && (
                              <View
                                style={[
                                  styles.bar,
                                  styles.incorrectBar,
                                  { height: incorrectHeight, width: BAR_WIDTH - 2 },
                                  pressed && { backgroundColor: '#dc2626' },
                                ]}
                              >
                                <Text style={styles.barNumberBottom}>{event.incorrect}</Text>
                              </View>
                            )}
                          </View>
                        </>
                      )}
                    </Pressable>
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
                  <View key={event.eventId} style={[styles.labelWrapper, { width: BAR_WIDTH }]}>
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
        </ScrollView>
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
  chartWrapper: {
    flexDirection: 'row',
  },
  scrollContent: {
    flexGrow: 1,
  },
  chartContent: {
    flex: 1,
  },
  chartContainer: {
    height: 176, // 88px up + 88px down
    position: 'relative',
  },
  yAxisContainer: {
    width: 36,
    height: 176, // Match chart height
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
    left: 0,
    right: 0,
    top: 88,
    height: 1,
  },
  barNumberTop: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  barNumberBottom: {
    position: 'absolute',
    top: 2,
    alignSelf: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
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
    paddingLeft: 8, // Match bars padding
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
