import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { getHypeHeatmapColor } from '../utils/heatmap';

interface PreFightCommentCardProps {
  comment: {
    id: string;
    content: string;
    hypeRating?: number | null;
    upvotes: number;
    userHasUpvoted: boolean;
    user: {
      displayName: string;
    };
  };
  onUpvote?: () => void;
  onFlag?: () => void;
  onEdit?: () => void;
  isUpvoting?: boolean;
  isFlagging?: boolean;
  isAuthenticated?: boolean;
  showMyComment?: boolean; // Flag to style as "My Comment"
}

export function PreFightCommentCard({
  comment,
  onUpvote,
  onFlag,
  onEdit,
  isUpvoting = false,
  isFlagging = false,
  isAuthenticated = false,
  showMyComment = false,
}: PreFightCommentCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View
      style={[
        styles.commentCard,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <View style={styles.commentContainer}>
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
        <View style={styles.commentContentContainer}>
          {/* Header: Username and Hype Rating/Flag */}
          <View style={styles.commentHeader}>
            <Text style={[styles.commentAuthor, { color: showMyComment ? '#83B4F3' : '#FFFFFF' }]}>
              {comment.user.displayName}
            </Text>
            <View style={styles.ratingFlagContainer}>
              {comment.hypeRating && comment.hypeRating > 0 && (
                <View style={styles.inlineRating}>
                  <FontAwesome6 name="fire-flame-curved" size={12} color={getHypeHeatmapColor(comment.hypeRating)} />
                  <Text style={[styles.commentRatingText, { color: colors.text, fontSize: 12 }]}>
                    {comment.hypeRating}
                  </Text>
                </View>
              )}
              {showMyComment && onEdit && (
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
              {onFlag && !showMyComment && (
                <TouchableOpacity
                  onPress={onFlag}
                  disabled={!isAuthenticated || isFlagging}
                  style={styles.flagButton}
                >
                  <FontAwesome
                    name="flag"
                    size={12}
                    color={isFlagging ? colors.textSecondary : colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Comment body */}
          <Text style={[styles.commentContent, { color: colors.textSecondary }]}>
            {comment.content}
          </Text>
        </View>
      </View>
    </View>
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
  ratingFlagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '700',
  },
  commentRatingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  commentContent: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
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
