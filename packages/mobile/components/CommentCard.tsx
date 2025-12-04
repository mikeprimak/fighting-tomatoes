import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { getHypeHeatmapColor } from '../utils/heatmap';

// Helper to format method for display
const formatMethod = (method: string | null | undefined): string => {
  if (!method) return '';
  switch (method.toUpperCase()) {
    case 'KO_TKO': return 'KO';
    case 'SUBMISSION': return 'Sub';
    case 'DECISION': return 'Dec';
    default: return method;
  }
};

interface CommentCardProps {
  comment: {
    id: string;
    content: string;
    rating: number;
    upvotes: number;
    userHasUpvoted: boolean;
    predictedWinner?: string | null;
    predictedMethod?: string | null;
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
  fighter1Id?: string;
  fighter2Id?: string;
  fighter1Name?: string;
  fighter2Name?: string;
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
  fighter1Id,
  fighter2Id,
  fighter1Name,
  fighter2Name,
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
          {/* Comment body */}
          <Text style={[styles.reviewContent, { color: '#FFFFFF' }]}>
            {comment.content}
          </Text>

          {/* Bottom right: 3-line info block */}
          <View style={styles.bottomRightBlock}>
            {/* Line 1: Username */}
            <Text style={[styles.reviewAuthor, { color: showMyReview ? '#F5C518' : '#FFFFFF' }]}>
              {comment.user.displayName}
            </Text>

            {/* Line 2: Rating + Prediction */}
            <View style={styles.ratingRow}>
              <View style={styles.inlineRating}>
                <FontAwesome name="star" size={14} color={getHypeHeatmapColor(comment.rating)} />
                <Text style={[styles.reviewRatingText, { color: colors.textSecondary, fontSize: 14 }]}>
                  {comment.rating}
                </Text>
              </View>
              {comment.predictedWinner && fighter1Id && fighter2Id && (
                <View style={styles.predictionContainer}>
                  <FontAwesome name="hand-o-right" size={14} color={colors.textSecondary} />
                  <Text style={[styles.predictedWinnerText, { color: colors.textSecondary }]}>
                    {comment.predictedWinner === fighter1Id ? fighter1Name : fighter2Name}
                    {comment.predictedMethod && ` by ${formatMethod(comment.predictedMethod)}`}
                  </Text>
                </View>
              )}
            </View>

            {/* Line 3: Action buttons */}
            <View style={styles.actionButtonsRow}>
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
  reviewAuthor: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  inlineRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  predictionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  predictedWinnerText: {
    fontSize: 14,
    fontWeight: '700',
  },
  reviewRatingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  replyButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  flagButton: {
    paddingVertical: 4,
    marginLeft: 12,
  },
  reviewContent: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  bottomRightBlock: {
    alignItems: 'flex-end',
    marginBottom: 4,
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
