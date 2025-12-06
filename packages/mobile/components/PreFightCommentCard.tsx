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

  const CardWrapper = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.7 } : {};

  return (
    <CardWrapper
      style={[
        styles.commentCard,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
      {...wrapperProps}
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
          {/* Top row: Username | Hype Rating | Predicted Winner */}
          <View style={styles.topInfoRow}>
            <Text style={[styles.commentAuthor, { color: showMyComment ? '#F5C518' : '#FFFFFF' }]}>
              {comment.user.displayName}
            </Text>
            {comment.hypeRating && comment.hypeRating > 0 && (
              <View style={styles.inlineRating}>
                <FontAwesome6 name="fire-flame-curved" size={14} color={getHypeHeatmapColor(comment.hypeRating)} />
                <Text style={[styles.commentRatingText, { color: colors.textSecondary, fontSize: 14 }]}>
                  {comment.hypeRating}
                </Text>
              </View>
            )}
            {comment.predictedWinner && fighter1Id && fighter2Id && (
              <View style={styles.predictionContainer}>
                <FontAwesome name="hand-o-right" size={14} color={colors.textSecondary} />
                <Text style={[styles.predictionText, { color: colors.textSecondary }]}>
                  {comment.predictedWinner === fighter1Id ? fighter1Name : fighter2Name}
                  {comment.predictedMethod && ` by ${formatMethod(comment.predictedMethod)}`}
                </Text>
              </View>
            )}
          </View>

          {/* Comment body */}
          <Text style={[styles.commentContent, { color: '#FFFFFF' }]}>
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
        </View>
      </View>
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  commentCard: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
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
  topInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '700',
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
  commentContent: {
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
