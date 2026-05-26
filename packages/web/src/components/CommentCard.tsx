'use client';

import { Star, Flame, ThumbsUp } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';

/** Comment card matching the mobile layout: upvote rail on the left, rating/flame
 *  inline next to the username. Shared between the fight detail screen and the
 *  My Activity screen so edits land in one place.
 *
 *  `item` fields:
 *   - content (string)
 *   - upvotes (number), userHasUpvoted (bool)
 *   - createdAt (date-ish)
 *   - rating (post-fight 1-10) OR hypeRating (pre-fight 1-10) — shown next to name
 *   - user?.displayName — falls back to "You" (isMine) / "Anonymous"
 *
 *  `onUpvote` optional: when omitted the rail is a static display (read-only
 *  contexts like My Activity). */
export function CommentCard({
  item,
  isMine = false,
  onUpvote,
  onEdit,
}: {
  item: any;
  isMine?: boolean;
  onUpvote?: () => void;
  onEdit?: () => void;
}) {
  const upvoteRail = (
    <>
      <ThumbsUp size={18} fill={item.userHasUpvoted ? '#F5C518' : 'none'} />
      <span className={`text-xs ${item.userHasUpvoted ? 'font-semibold' : 'text-text-secondary'}`}>
        {item.upvotes ?? 0}
      </span>
    </>
  );

  return (
    <div className={`flex gap-3 rounded-lg border bg-card p-3 ${isMine ? 'border-primary/50' : 'border-border'}`}>
      {/* Upvote rail (left of everything, like mobile) */}
      {onUpvote ? (
        <button
          onClick={onUpvote}
          className="flex shrink-0 flex-col items-center gap-1 pt-0.5 transition-colors hover:opacity-80"
          style={{ color: item.userHasUpvoted ? '#F5C518' : undefined }}
          aria-label="Upvote"
        >
          {upvoteRail}
        </button>
      ) : (
        <div
          className="flex shrink-0 flex-col items-center gap-1 pt-0.5"
          style={{ color: item.userHasUpvoted ? '#F5C518' : undefined }}
        >
          {upvoteRail}
        </div>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-bold">{item.user?.displayName || (isMine ? 'You' : 'Anonymous')}</span>
          {item.rating != null && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: getHypeHeatmapColor(item.rating) }}>
              <Star size={13} style={{ color: getHypeHeatmapColor(item.rating) }} fill={getHypeHeatmapColor(item.rating)} />
              {item.rating}
            </span>
          )}
          {item.rating == null && item.hypeRating != null && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: getHypeHeatmapColor(item.hypeRating) }}>
              <Flame size={13} style={{ color: getHypeHeatmapColor(item.hypeRating) }} />
              {item.hypeRating}
            </span>
          )}
        </div>
        <p className="text-sm text-foreground">{item.content}</p>
        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-text-secondary">
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          {isMine && onEdit && (
            <button onClick={onEdit} className="font-semibold uppercase tracking-wide hover:text-primary">
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
