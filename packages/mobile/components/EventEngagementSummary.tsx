import React from 'react';
import { View, Text, StyleSheet, useColorScheme, Image } from 'react-native';
import { Colors } from '../constants/Colors';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { api } from '../services/api';

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
    fighter1Id?: string;
    fighter2Id?: string;
    predictedWinner?: string;
  }>;
  userAvatar?: string;
  userInitial?: string;
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
  userAvatar,
  userInitial,
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
      <View style={styles.contentWrapper}>
        {/* User Avatar */}
        <View style={styles.avatarContainer}>
          {userAvatar ? (
            <Image
              source={{ uri: `${api.baseURL}${userAvatar}` }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={[styles.avatarText, { color: colors.textOnAccent }]}>
              {userInitial || '?'}
            </Text>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Most Hyped Fights Row */}
          {topHypedFights.length > 0 && (
            <View style={styles.hypedSection}>
          <View style={styles.row}>
            <View style={styles.iconContainer}>
              <FontAwesome6 name="fire-flame-curved" size={14} color="#FF6B35" />
            </View>
            <Text style={[styles.text, { color: colors.textSecondary }]}>
              I'm hyped for:
            </Text>
          </View>
          {topHypedFights.map((fight) => {
            const fighter1LastName = getLastName(fight.fighter1);
            const fighter2LastName = getLastName(fight.fighter2);
            const predictedFighter1 = fight.predictedWinner === fight.fighter1Id;
            const predictedFighter2 = fight.predictedWinner === fight.fighter2Id;

            return (
              <Text key={fight.fightId} style={[styles.fightText, { color: colors.text }]}>
                <Text style={predictedFighter1 ? { color: '#83B4F3' } : undefined}>
                  {fighter1LastName}
                </Text>
                {' vs '}
                <Text style={predictedFighter2 ? { color: '#83B4F3' } : undefined}>
                  {fighter2LastName}
                </Text>
              </Text>
            );
          })}
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
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 4,
      marginTop: 16,
      marginBottom: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 0,
    },
    contentWrapper: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },
    avatarContainer: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      flexShrink: 0,
      marginLeft: 8,
    },
    avatarImage: {
      width: 70,
      height: 70,
    },
    avatarText: {
      fontSize: 28,
      fontWeight: 'bold',
    },
    content: {
      flex: 1,
      gap: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    hypedSection: {
      gap: 4,
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
    fightText: {
      fontSize: 14,
      lineHeight: 20,
      paddingLeft: 28,
      fontWeight: '600',
    },
    boldText: {
      fontWeight: '600',
    },
  });
