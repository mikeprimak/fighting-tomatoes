/**
 * Calculate quality thread score for a comment/review with replies
 * This algorithm balances parent quality, reply quality, engagement, and exceptional replies
 * No time decay since most comments happen within days of fight
 *
 * @param comment - Comment/review object with upvoteCount and replies array
 * @returns Quality score for sorting (higher = better)
 */
export function calculateQualityThreadScore(comment: {
  upvotes: number;
  replies: Array<{ upvotes: number }>;
}): number {
  // 1. Base score from parent upvotes
  const parentScore = comment.upvotes;

  // 2. Aggregate reply upvotes (diminishing returns via sqrt)
  // This prevents threads with many mediocre replies from dominating
  const replyUpvotes = comment.replies.reduce((sum, r) => sum + r.upvotes, 0);
  const replyScore = Math.sqrt(replyUpvotes) * 2;

  // 3. Engagement bonus (having active discussion)
  // Log scale so 2 replies doesn't get 2x bonus vs 1 reply
  const engagementBonus = comment.replies.length > 0
    ? Math.log(comment.replies.length + 1) * 1.5
    : 0;

  // 4. Exceptional reply multiplier
  // If any reply has 3x more upvotes than parent, boost entire thread by 1.5x
  // This surfaces threads where parent might be meh but reply is gold
  const maxReplyUpvotes = comment.replies.length > 0
    ? Math.max(...comment.replies.map(r => r.upvotes))
    : 0;
  const exceptionalMultiplier = maxReplyUpvotes > (parentScore * 3) ? 1.5 : 1;

  return (parentScore + replyScore + engagementBonus) * exceptionalMultiplier;
}
