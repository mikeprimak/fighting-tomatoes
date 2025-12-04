import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { getHypeHeatmapColor } from '../utils/heatmap';

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
    fight?: {
      id: string;
      fighter1Name: string;
      fighter2Name: string;
      eventName: string;
    };
  };
  onPress?: () => void;
  onUpvote?: () => void;
  onFlag?: () => void;
  onEdit?: () => void;
  onReply?: () => void;
  isUpvoting?: boolean;
  isFlagging?: boolean;
  isAuthenticated?: boolean;
  showMyReview?: boolean; // Flag to style as "My Review"
}

export function CommentCard({
  comment,
  onPress,
  onUpvote,
  onFlag,
  onEdit,
  onReply,
  isUpvoting = false,
  isFlagging = false,
  isAuthenticated = false,
  showMyReview = false,
}: CommentCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <TouchableOpacity
      style={[
        styles.reviewCard,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
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
          {/* Comment body - full width */}
          <Text style={[styles.reviewContent, { color: colors.textSecondary }]}>
            {comment.content}
          </Text>

          {/* Footer: Rating - Username Reply Edit */}
          <View style={styles.footerContainer}>
            {/* Left side: Rating - Username */}
            <View style={styles.footerLeft}>
              <View style={styles.inlineRating}>
                <FontAwesome name="star" size={12} color={getHypeHeatmapColor(comment.rating)} />
                <Text style={[styles.reviewRatingText, { color: colors.text, fontSize: 12 }]}>
                  {comment.rating}
                </Text>
              </View>
              <Text style={[styles.reviewAuthor, { color: showMyReview ? '#F5C518' : '#FFFFFF' }]}>
                {comment.user.displayName}
              </Text>
            </View>

            {/* Right side: Reply + Edit/Flag */}
            <View style={styles.footerRight}>
              {onReply && !showMyReview && (
                <TouchableOpacity
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    onReply?.();
                  }}
                  disabled={!isAuthenticated}
                  style={styles.replyButton}
                >
                  <FontAwesome
                    name="reply"
                    size={12}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.replyButtonText, { color: colors.textSecondary }]}>
                    Reply
                  </Text>
                </TouchableOpacity>
              )}
              {showMyReview && onEdit && (
                <TouchableOpacity
                  onPress={onEdit}
                  style={styles.editButton}
                >
                  <FontAwesome
                    name="edit"
                    size={12}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.editButtonText, { color: colors.textSecondary }]}>
                    Edit
                  </Text>
                </TouchableOpacity>
              )}
              {onFlag && !showMyReview && (
                <TouchableOpacity
                  onPress={onFlag}
                  disabled={!isAuthenticated || isFlagging}
                  style={styles.flagButton}
                >
                  <FontAwesome
                    name="flag"
                    size={12}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Fight info at bottom */}
          <View style={styles.fightInfo}>
            {comment.fight && (
              <>
                <Text style={[styles.fightText, { color: colors.textSecondary }]}>
                  {comment.fight.fighter1Name} vs {comment.fight.fighter2Name}
                </Text>
                <Text style={[styles.eventText, { color: colors.textSecondary }]}>
                  {comment.fight.eventName}
                </Text>
              </>
            )}
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
  myReviewCard: {
    borderWidth: 2,
  },
  reviewContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  reviewContentContainer: {
    flex: 1,
  },
  userRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingFlagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  inlineRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  flagButton: {
    padding: 4,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  replyButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reviewAuthor: {
    fontSize: 12,
    fontWeight: '600',
  },
  dashSeparator: {
    fontSize: 12,
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
  fightInfo: {
    gap: 2,
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  fightText: {
    fontSize: 12,
    textAlign: 'right',
  },
  eventText: {
    fontSize: 12,
    textAlign: 'right',
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
