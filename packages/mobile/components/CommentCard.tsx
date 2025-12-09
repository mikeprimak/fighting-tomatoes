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

  const CardWrapper = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.7 } : {};

  return (
    <CardWrapper
      style={[
        styles.reviewCard,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
      {...wrapperProps}
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
          {/* Top row: Username | Star Rating | Predicted Winner */}
          <View style={styles.topInfoRow}>
            <View style={showMyReview ? { borderBottomWidth: 2, borderBottomColor: '#F5C518' } : undefined}>
              <Text style={[styles.reviewAuthor, { color: colors.textSecondary }]}>
                {comment.user.displayName}
              </Text>
            </View>
            <View style={styles.inlineRating}>
              <FontAwesome name="star" size={14} color={getHypeHeatmapColor(comment.rating)} />
              <Text style={[styles.reviewRatingText, { color: colors.textSecondary, fontSize: 14 }]}>
                {comment.rating}
              </Text>
            </View>
            {comment.predictedWinner && fighter1Id && fighter2Id && (
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, flexShrink: 1 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                ({comment.predictedWinner === fighter1Id ? fighter1Name : fighter2Name})
              </Text>
            )}
          </View>

          {/* Comment body */}
          <Text style={[styles.reviewContent, { color: '#FFFFFF' }]}>
            {comment.content}
          </Text>

          {/* Bottom row: Action buttons on the right */}
          <View style={styles.bottomRow}>
            {/* Fight info on the left (if present) */}
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

            {/* Action buttons on the right */}
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
        </View>
      </View>
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  reviewCard: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
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
  topInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    gap: 8,
    marginBottom: 6,
  },
  reviewAuthor: {
    fontSize: 14,
    fontWeight: '700',
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
  reviewContent: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  fightInfo: {
    flex: 1,
    gap: 2,
  },
  fightText: {
    fontSize: 12,
  },
  eventText: {
    fontSize: 12,
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
