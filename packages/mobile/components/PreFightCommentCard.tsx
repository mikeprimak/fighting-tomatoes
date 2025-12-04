import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
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

interface PreFightCommentCardProps {
  comment: {
    id: string;
    content: string;
    hypeRating?: number | null;
    predictedWinner?: string | null;
    predictedMethod?: string | null;
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
  showMyComment?: boolean; // Flag to style as "My Comment"
}

export function PreFightCommentCard({
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
  showMyComment = false,
}: PreFightCommentCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <TouchableOpacity
      style={[
        styles.commentCard,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.commentContainer}>
        {/* Left side: Upvote button */}
        <TouchableOpacity
          style={styles.upvoteButton}
          onPress={(e) => {
            e?.stopPropagation?.();
            onUpvote?.();
          }}
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
        <View style={styles.commentContentContainer}>
          {/* Comment body */}
          <Text style={[styles.commentContent, { color: colors.textSecondary }]}>
            {comment.content}
          </Text>

          {/* Bottom right: 3-line info block */}
          <View style={styles.bottomRightBlock}>
            {/* Line 1: Username */}
            <Text style={[styles.commentAuthor, { color: showMyComment ? '#F5C518' : '#FFFFFF' }]}>
              {comment.user.displayName}
            </Text>

            {/* Line 2: Hype Rating + Prediction */}
            <View style={styles.ratingRow}>
              {comment.hypeRating && comment.hypeRating > 0 && (
                <View style={styles.inlineRating}>
                  <FontAwesome6 name="fire-flame-curved" size={14} color={getHypeHeatmapColor(comment.hypeRating)} />
                  <Text style={[styles.commentRatingText, { color: colors.text, fontSize: 14 }]}>
                    {comment.hypeRating}
                  </Text>
                </View>
              )}
              {comment.predictedWinner && fighter1Id && fighter2Id && (
                <View style={styles.predictionContainer}>
                  <FontAwesome name="hand-o-right" size={14} color="#FFFFFF" />
                  <Text style={[styles.predictionText, { color: '#FFFFFF' }]}>
                    {comment.predictedWinner === fighter1Id ? fighter1Name : fighter2Name}
                    {comment.predictedMethod && ` by ${formatMethod(comment.predictedMethod)}`}
                  </Text>
                </View>
              )}
            </View>

            {/* Line 3: Action buttons */}
            <View style={styles.actionButtonsRow}>
              {onReply && !showMyComment && (
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
              {showMyComment && onEdit && (
                <TouchableOpacity
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    onEdit?.();
                  }}
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
              {onFlag && !showMyComment && (
                <TouchableOpacity
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    onFlag?.();
                  }}
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
  commentCard: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 0,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  commentContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  commentContentContainer: {
    flex: 1,
  },
  commentAuthor: {
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
  predictionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  predictionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inlineRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  commentRatingText: {
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
  commentContent: {
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
