import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';

interface EventEngagementSummaryProps {
  totalFights: number;
  predictionsCount: number;
  ratingsCount: number;
  alertsCount: number;
  averageHype: number | null;
  topHypedFights: Array<{
    fightId: string;
    hype: number;
    fighter1: string;
    fighter2: string;
  }>;
}

const getLastName = (fullName: string) => {
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
};

export default function EventEngagementSummary({
  totalFights,
  predictionsCount,
  ratingsCount,
  alertsCount,
  averageHype,
  topHypedFights,
}: EventEngagementSummaryProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // If user hasn't interacted with any fights, don't show anything
  if (predictionsCount === 0 && ratingsCount === 0 && alertsCount === 0) {
    return null;
  }

  const styles = createStyles(colors);

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Predictions Row */}
      {predictionsCount > 0 && (
        <View style={styles.row}>
          <View style={styles.iconContainer}>
            <FontAwesome name="eye" size={14} color="#83B4F3" />
          </View>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            I've predicted{' '}
            <Text style={[styles.boldText, { color: colors.text }]}>
              {predictionsCount}
            </Text>
            {' '}fights.
          </Text>
        </View>
      )}

      {/* Most Hyped Fights Row */}
      {topHypedFights.length > 0 && (
        <View style={styles.row}>
          <View style={styles.iconContainer}>
            <FontAwesome6 name="fire-flame-curved" size={14} color="#FF6B35" />
          </View>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            I'm hyped for:{' '}
            {topHypedFights.map((fight, index) => {
              const vs = `${getLastName(fight.fighter1)} vs ${getLastName(fight.fighter2)}`;
              if (index === topHypedFights.length - 1) {
                return (
                  <Text key={fight.fightId} style={[styles.text, { color: colors.text }]}>
                    {vs}
                  </Text>
                );
              } else if (index === topHypedFights.length - 2) {
                return (
                  <Text key={fight.fightId}>
                    <Text style={[styles.text, { color: colors.text }]}>{vs}</Text>
                    {' and '}
                  </Text>
                );
              } else {
                return (
                  <Text key={fight.fightId}>
                    <Text style={[styles.text, { color: colors.text }]}>{vs}</Text>
                    {', '}
                  </Text>
                );
              }
            })}
          </Text>
        </View>
      )}

      {/* Ratings Row (Optional - if you want to show this) */}
      {ratingsCount > 0 && (
        <View style={styles.row}>
          <View style={styles.iconContainer}>
            <FontAwesome name="star" size={14} color="#f59e0b" />
          </View>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            I've rated{' '}
            <Text style={[styles.boldText, { color: colors.text }]}>
              {ratingsCount} of {totalFights}
            </Text>
            {' '}fights.
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 4,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      gap: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    iconContainer: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    textContainer: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    text: {
      fontSize: 14,
      lineHeight: 20,
      flexShrink: 1,
    },
    boldText: {
      fontWeight: '600',
    },
  });
