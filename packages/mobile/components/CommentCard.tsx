import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface CommentCardProps {
  comment: {
    id: string;
    content: string;
    rating: number;
    upvotes: number;
    userHasUpvoted: boolean;
    user: {
      displayName: string;
    };
    fight: {
      id: string;
      fighter1Name: string;
      fighter2Name: string;
      eventName: string;
    };
  };
  onPress?: () => void;
  onUpvote?: () => void;
  isUpvoting?: boolean;
  isAuthenticated?: boolean;
}

export function CommentCard({
  comment,
  onPress,
  onUpvote,
  isUpvoting = false,
  isAuthenticated = false,
}: CommentCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <TouchableOpacity
      style={[styles.reviewCard, { backgroundColor: colors.background, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.reviewContainer}>
        {/* Left side: Upvote button */}
        <TouchableOpacity
          style={styles.upvoteButton}
          onPress={onUpvote}
          disabled={!isAuthenticated || isUpvoting || !onUpvote}
        >
          <FontAwesome
            name={comment.userHasUpvoted ? "thumbs-up" : "thumbs-o-up"}
            size={18}
            color={comment.userHasUpvoted ? '#F5C518' : colors.textSecondary}
          />
          <Text
            style={[
              styles.upvoteButtonText,
              { color: comment.userHasUpvoted ? '#F5C518' : colors.textSecondary }
            ]}
          >
            {comment.upvotes || 0}
          </Text>
        </TouchableOpacity>

        {/* Right side: Comment content */}
        <View style={styles.reviewContentContainer}>
          {/* Rating in top right corner */}
          <View style={styles.topRightRating}>
            <FontAwesome name="star" size={14} color="#F5C518" />
            <Text style={[styles.reviewRatingText, { color: colors.text }]}>
              {comment.rating}
            </Text>
          </View>

          <Text style={[styles.reviewContent, styles.reviewContentWithRating, { color: colors.textSecondary }]}>
            {comment.content}
          </Text>

          <View style={styles.fightInfo}>
            <Text style={[styles.fightText, { color: colors.textSecondary }]}>
              {comment.fight.fighter1Name} vs {comment.fight.fighter2Name}
            </Text>
            <Text style={[styles.eventText, { color: colors.textSecondary }]}>
              {comment.fight.eventName}
            </Text>
            <Text style={[styles.reviewContent, { color: colors.textSecondary }]}>
              by {comment.user.displayName}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  reviewCard: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 0,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  reviewContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  reviewContentContainer: {
    flex: 1,
  },
  topRightRating: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewAuthor: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewRatingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewContent: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  reviewContentWithRating: {
    paddingRight: 50,
  },
  fightInfo: {
    gap: 2,
    marginBottom: -4,
  },
  fightText: {
    fontSize: 13,
    fontWeight: '500',
  },
  eventText: {
    fontSize: 12,
  },
  upvoteButton: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 50,
  },
  upvoteButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
