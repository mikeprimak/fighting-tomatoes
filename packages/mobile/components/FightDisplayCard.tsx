import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Colors } from '../constants/Colors';

// Type definitions based on the existing API types
interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  wins: number;
  losses: number;
  draws: number;
}

interface Event {
  id: string;
  name: string;
  date: string;
  promotion: string;
}

export interface FightData {
  id: string;
  event: Event;
  fighter1: Fighter;
  fighter2: Fighter;
  weightClass?: string;
  isTitle: boolean;
  titleName?: string;
  averageRating: number;
  totalRatings: number;
  totalReviews: number;
  watchPlatform?: string;
  watchUrl?: string;
  // User-specific data
  userRating?: number;
  userReview?: {
    content: string;
    rating: number;
    createdAt: string;
  };
  userTags?: string[];
}

interface FightDisplayCardProps {
  fight: FightData;
  onPress: (fight: FightData) => void;
  showActionButton?: boolean;
  actionButtonText?: string;
  customActionButton?: React.ReactNode;
}

export default function FightDisplayCard({
  fight,
  onPress,
  showActionButton = true,
  actionButtonText = 'Rate Fight',
  customActionButton,
}: FightDisplayCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];


  const getFighterName = (fighter: Fighter) => {
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return fighter.nickname ? `${name} "${fighter.nickname}"` : name;
  };

  const getFighterRecord = (fighter: Fighter) => {
    return `${fighter.wins}-${fighter.losses}-${fighter.draws}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <TouchableOpacity
      style={[styles.fightCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(fight)}
    >
      <View style={styles.fightHeader}>
        <View style={styles.eventInfo}>
          <Text style={[styles.eventName, { color: colors.textSecondary }]}>
            {fight.event.name} • {formatDate(fight.event.date)}
          </Text>
          {fight.isTitle && (
            <Text style={[styles.titleBadge, { color: colors.primary }]}>TITLE FIGHT</Text>
          )}
        </View>
        <Text style={[styles.orgBadge, { color: colors.primary }]}>
          {fight.event.promotion}
        </Text>
      </View>

      <View style={styles.fightersContainer}>
        <View style={styles.fighter}>
          <Text style={[styles.fighterName, { color: colors.text }]}>
            {getFighterName(fight.fighter1)}
          </Text>
          <Text style={[styles.record, { color: colors.textSecondary }]}>
            {getFighterRecord(fight.fighter1)}
          </Text>
        </View>

        <View style={styles.vsContainer}>
          <Text style={[styles.vs, { color: colors.textSecondary }]}>VS</Text>
          {fight.weightClass && (
            <Text style={[styles.weightClass, { color: colors.textSecondary }]}>
              {fight.weightClass}
            </Text>
          )}
        </View>

        <View style={styles.fighter}>
          <Text style={[styles.fighterName, { color: colors.text }]}>
            {getFighterName(fight.fighter2)}
          </Text>
          <Text style={[styles.record, { color: colors.textSecondary }]}>
            {getFighterRecord(fight.fighter2)}
          </Text>
        </View>
      </View>

      {/* User Rating Section */}
      {fight.userRating && (
        <View style={styles.userRatingSection}>
          <Text style={[styles.userRatingLabel, { color: colors.textSecondary }]}>
            Your Rating:
          </Text>
          <View style={styles.userRatingDisplay}>
            <Text style={[styles.userRatingStars, { color: colors.primary }]}>
              {'★'.repeat(fight.userRating)}{'☆'.repeat(10 - fight.userRating)}
            </Text>
            <Text style={[styles.userRatingNumber, { color: colors.primary }]}>
              {fight.userRating}/10
            </Text>
          </View>
          {fight.userReview && (
            <Text style={[styles.userReviewText, { color: colors.text }]} numberOfLines={2}>
              "{fight.userReview.content}"
            </Text>
          )}
          {fight.userTags && fight.userTags.length > 0 && (
            <View style={styles.userTagsContainer}>
              {fight.userTags.slice(0, 3).map((tag, index) => (
                <Text key={index} style={[styles.userTag, { color: colors.primary, borderColor: colors.primary }]}>
                  {tag}
                </Text>
              ))}
              {fight.userTags.length > 3 && (
                <Text style={[styles.userTagsMore, { color: colors.textSecondary }]}>
                  +{fight.userTags.length - 3} more
                </Text>
              )}
            </View>
          )}
        </View>
      )}


      <View style={styles.ratingSection}>
        {customActionButton ? (
          customActionButton
        ) : showActionButton ? (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={() => onPress(fight)}
            >
              <Text style={styles.actionButtonText}>{actionButtonText}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {fight.totalRatings > 0 && (
          <View style={styles.avgRatingContainer}>
            <Text style={[styles.avgRating, { color: colors.text }]}>
              ⭐ {fight.averageRating.toFixed(1)}/10
            </Text>
            <Text style={[styles.ratingCount, { color: colors.textSecondary }]}>
              ({fight.totalRatings} rating{fight.totalRatings !== 1 ? 's' : ''})
              {fight.totalReviews > 0 && ` • ${fight.totalReviews} review${fight.totalReviews !== 1 ? 's' : ''}`}
            </Text>
          </View>
        )}
      </View>

      {fight.watchPlatform && (
        <View style={styles.watchInfo}>
          <Text style={[styles.watchText, { color: colors.textSecondary }]}>
            Watch on {fight.watchPlatform}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fightCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  fightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 12,
    marginBottom: 2,
  },
  titleBadge: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  orgBadge: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  fightersContainer: {
    marginBottom: 12,
  },
  fighter: {
    alignItems: 'center',
    marginBottom: 8,
  },
  fighterName: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  record: {
    fontSize: 12,
    marginTop: 2,
  },
  vsContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  vs: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  weightClass: {
    fontSize: 10,
    marginTop: 2,
  },
  ratingSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  avgRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avgRating: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  ratingCount: {
    fontSize: 12,
  },
  watchInfo: {
    alignItems: 'center',
    marginTop: 4,
  },
  watchText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  // User Rating Styles
  userRatingSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 12,
    marginHorizontal: -16,
    marginBottom: 12,
    borderRadius: 8,
  },
  userRatingLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  userRatingDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userRatingStars: {
    fontSize: 16,
    marginRight: 8,
  },
  userRatingNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  userReviewText: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
    lineHeight: 18,
  },
  userTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  userTag: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  userTagsMore: {
    fontSize: 11,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
});