'use client';

import { useQuery } from '@tanstack/react-query';
import { getFight, getFightAggregateStats, getFightReviews, getFightPreFightComments } from '@/lib/api';
import { FighterAvatar } from '@/components/FighterAvatar';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { formatEventDate } from '@/utils/dateFormatters';
import { useSpoilerFree } from '@/lib/spoilerFree';
import { useAuth } from '@/lib/auth';
import { Flame, Star, MessageSquare, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { VerticalDistributionChart } from '@/components/charts/VerticalDistributionChart';
import { RateFightModal } from '@/components/RateFightModal';
import { HypeFightModal } from '@/components/HypeFightModal';
import { CommentCard } from '@/components/CommentCard';
import {
  createPreFightComment,
  updatePreFightComment,
  updateFightUserData,
  toggleReviewUpvote,
  togglePreFightCommentUpvote,
} from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  fightId: string;
  initialFight: any;
}

/** "WELTERWEIGHT" -> "Welterweight", "WOMEN'S STRAWWEIGHT" -> "Women's Strawweight" */
function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function FighterDisplay({ fighter, isWinner, hideSpoilers, resultText }: { fighter: any; isWinner: boolean; hideSpoilers: boolean; resultText?: string }) {
  return (
    <div className="flex w-28 flex-col items-center gap-2 sm:w-36">
      <div className={`h-24 w-24 overflow-hidden rounded-full sm:h-32 sm:w-32 ${
        !hideSpoilers && isWinner ? 'ring-3 ring-success' : 'bg-card'
      }`}>
        <FighterAvatar
          src={fighter.profileImage}
          alt={`${fighter.firstName} ${fighter.lastName}`}
          initials={`${fighter.firstName[0]}${fighter.lastName[0]}`}
          imgClassName={`h-full w-full object-cover ${!hideSpoilers && !isWinner && fighter.id ? 'opacity-60' : ''}`}
          initialsClassName="flex h-full w-full items-center justify-center text-2xl font-bold text-text-secondary"
        />
      </div>
      <Link href={`/fighters/${fighter.id}`} className="text-center hover:text-primary">
        <p className={`text-sm font-bold sm:text-base ${!hideSpoilers && isWinner ? 'text-success' : ''}`}>
          {fighter.firstName} {fighter.lastName}
        </p>
        {fighter.nickname && (
          <p className="text-xs text-text-secondary">&quot;{fighter.nickname}&quot;</p>
        )}
      </Link>
      {!hideSpoilers && isWinner && resultText && (
        <p className="text-center text-xs font-semibold text-success">{resultText}</p>
      )}
      <p className="text-xs text-text-secondary">
        {fighter.wins}-{fighter.losses}-{fighter.draws}
      </p>
    </div>
  );
}

export function FightDetailClient({ fightId, initialFight }: Props) {
  const { spoilerFreeMode } = useSpoilerFree();
  const { isAuthenticated, user } = useAuth();
  const [outcomeRevealed, setOutcomeRevealed] = useState(false);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [hypeModalOpen, setHypeModalOpen] = useState(false);

  const { data: fightData, isLoading } = useQuery({
    queryKey: ['fight', fightId],
    queryFn: () => getFight(fightId),
    initialData: initialFight ? { fight: initialFight } : undefined,
  });

  const { data: statsData } = useQuery({
    queryKey: ['fightStats', fightId],
    queryFn: () => getFightAggregateStats(fightId),
    enabled: !!fightData,
  });

  const fight = fightData?.fight;
  const stats = statsData;

  if (isLoading || !fight) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const isCompleted = fight.fightStatus === 'COMPLETED';
  const isUpcoming = fight.fightStatus === 'UPCOMING' || fight.fightStatus === 'SCHEDULED';
  const hideSpoilers = isCompleted && spoilerFreeMode && !fight.userRating && !outcomeRevealed;

  const isWinner1 = fight.winner === fight.fighter1.id;
  const isWinner2 = fight.winner === fight.fighter2.id;
  const isNoContest = fight.winner === 'nc';
  const isDraw = fight.winner === 'draw';

  const resultText = fight.method
    ? `${fight.method}${fight.round ? ` — Round ${fight.round}` : ''}${fight.time ? ` (${fight.time})` : ''}`
    : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Fighters */}
      <div className="mb-6 flex items-start justify-center gap-6 sm:gap-12">
        <FighterDisplay fighter={fight.fighter1} isWinner={isWinner1} hideSpoilers={hideSpoilers} resultText={resultText} />
        <div className="flex flex-col items-center gap-1 pt-8">
          <span className="text-lg font-bold text-text-secondary">VS</span>
          {fight.isTitle && (
            <span className="mt-1 rounded bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {fight.titleName || 'TITLE FIGHT'}
            </span>
          )}
        </div>
        <FighterDisplay fighter={fight.fighter2} isWinner={isWinner2} hideSpoilers={hideSpoilers} resultText={resultText} />
      </div>

      {/* No Contest / Draw badge */}
      {isCompleted && !hideSpoilers && isNoContest && (
        <div className="mb-4 text-center">
          <span className="rounded px-3 py-1 text-sm font-bold" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>
            NO CONTEST
          </span>
        </div>
      )}
      {isCompleted && !hideSpoilers && isDraw && (
        <div className="mb-4 text-center">
          <span className="rounded px-3 py-1 text-sm font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            DRAW
          </span>
        </div>
      )}

      {/* Spoiler reveal button */}
      {isCompleted && hideSpoilers && (
        <div className="mb-4 text-center">
          <button
            onClick={() => setOutcomeRevealed(true)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:border-primary hover:text-primary"
          >
            Reveal Outcome
          </button>
        </div>
      )}

      {/* Event info */}
      <div className="mb-6 rounded-lg border border-border bg-card p-3 text-center text-sm text-text-secondary">
        <Link href={`/events/${fight.event?.id}`} className="font-medium text-foreground hover:text-primary">
          {fight.event?.name}
        </Link>
        <span className="mx-2">-</span>
        <span>{fight.event?.date ? formatEventDate(fight.event.date, { weekday: 'long', month: 'long', year: true }) : ''}</span>
        {fight.cardType && <span className="mx-2">-</span>}
        {fight.cardType && <span>{fight.cardType}</span>}
        {fight.weightClass && <span className="mx-2">-</span>}
        {fight.weightClass && <span>{toTitleCase(fight.weightClass)}</span>}
      </div>

      {/* Odds (upcoming) */}
      {isUpcoming && (fight.fighter1Odds || fight.fighter2Odds) && (
        <div className="mb-4 flex justify-center gap-8 rounded-lg border border-border bg-card p-3">
          <div className="text-center">
            <p className="text-xs text-text-secondary">{fight.fighter1.lastName}</p>
            <p className="text-sm font-bold">{fight.fighter1Odds || '—'}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-secondary">{fight.fighter2.lastName}</p>
            <p className="text-sm font-bold">{fight.fighter2Odds || '—'}</p>
          </div>
        </div>
      )}

      {/* Hype section (upcoming) */}
      {isUpcoming && stats && (
        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Flame size={16} className="text-primary" />
            Crowd Hype
          </h3>
          <div className="rounded-lg border border-border bg-card p-4">
            {stats.communityAverageHype != null && stats.communityAverageHype > 0 ? (
              <div className="mb-3 flex items-center justify-center gap-2">
                <Flame size={20} style={{ color: getHypeHeatmapColor(stats.communityAverageHype) }} />
                <span className="text-3xl font-bold" style={{ color: getHypeHeatmapColor(stats.communityAverageHype) }}>
                  {stats.communityAverageHype.toFixed(1)}
                </span>
                <span className="text-sm text-text-secondary">/ 10</span>
              </div>
            ) : (
              <p className="mb-3 text-center text-sm text-text-secondary">No hype ratings yet</p>
            )}
            {stats.hypeDistribution && Object.keys(stats.hypeDistribution).length > 0 && (
              <VerticalDistributionChart distribution={stats.hypeDistribution} label="Hype" maxBarHeight={80} />
            )}
          </div>
        </div>
      )}

      {/* Rating section (completed) */}
      {isCompleted && stats && (
        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Star size={16} className="text-primary" />
            Community Rating
          </h3>
          <div className="rounded-lg border border-border bg-card p-4">
            {stats.averageRating > 0 ? (
              <div className="mb-3 flex items-center justify-center gap-2">
                <Star size={20} style={{ color: getHypeHeatmapColor(stats.averageRating) }} fill={getHypeHeatmapColor(stats.averageRating)} />
                <span className="text-3xl font-bold" style={{ color: getHypeHeatmapColor(stats.averageRating) }}>
                  {stats.averageRating.toFixed(1)}
                </span>
                <span className="text-sm text-text-secondary">/ 10</span>
                <span className="text-sm text-text-secondary">({stats.totalRatings} ratings)</span>
              </div>
            ) : (
              <p className="mb-3 text-center text-sm text-text-secondary">No ratings yet</p>
            )}
            {stats.ratingDistribution && Object.keys(stats.ratingDistribution).length > 0 && (
              <VerticalDistributionChart distribution={stats.ratingDistribution} label="Rating" maxBarHeight={80} />
            )}
            {fight.userRating != null && (
              <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-border pt-3 text-sm">
                <span className="text-text-secondary">Your rating:</span>
                <Star size={16} style={{ color: getHypeHeatmapColor(fight.userRating) }} fill={getHypeHeatmapColor(fight.userRating)} />
                <span className="font-bold" style={{ color: getHypeHeatmapColor(fight.userRating) }}>{fight.userRating}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top tags (completed) */}
      {isCompleted && stats?.topTags && stats.topTags.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold">Fight Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {stats.topTags.map((tag: any) => (
              <span key={tag.name} className="rounded-full bg-card px-2.5 py-1 text-xs text-text-secondary">
                {tag.name} <span className="text-primary">({tag.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mb-6 flex justify-center gap-3">
        {isCompleted && (
          <button
            onClick={() => isAuthenticated ? setRateModalOpen(true) : undefined}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-text-on-accent transition-colors hover:bg-primary/90"
          >
            <Star size={16} />
            {fight.userRating ? `Your Rating: ${fight.userRating}` : 'Rate Fight'}
          </button>
        )}
        {isUpcoming && (
          <button
            onClick={() => isAuthenticated ? setHypeModalOpen(true) : undefined}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-text-on-accent transition-colors hover:bg-primary/90"
          >
            <Flame size={16} />
            {stats?.userHypeScore ? `Your Hype: ${stats.userHypeScore}` : 'Rate Hype'}
          </button>
        )}
        {!isAuthenticated && (
          <Link href="/login" className="flex items-center gap-2 rounded-lg border border-primary px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/10">
            Sign in to {isCompleted ? 'rate' : 'hype'}
          </Link>
        )}
      </div>

      {/* Comments section */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <MessageSquare size={16} className="text-primary" />
          {isCompleted ? 'Reviews' : 'Pre-Fight Comments'}
        </h3>
        <CommentsSection
          fightId={fightId}
          isCompleted={isCompleted}
          currentUserId={user?.id}
          myReviewFromFight={fight.userReview}
        />
      </div>

      {/* Modals */}
      <RateFightModal
        isOpen={rateModalOpen}
        onClose={() => setRateModalOpen(false)}
        fight={fight}
        existingRating={fight.userRating}
        existingReview={fight.userReview}
        hideCommentsLink
      />
      <HypeFightModal
        isOpen={hypeModalOpen}
        onClose={() => setHypeModalOpen(false)}
        fight={fight}
        existingHype={stats?.userHypeScore ?? undefined}
        hideCommentsLink
      />
    </div>
  );
}

interface CommentsSectionProps {
  fightId: string;
  isCompleted: boolean;
  currentUserId?: string;
  myReviewFromFight?: any;
}

function CommentsSection({ fightId, isCompleted, currentUserId, myReviewFromFight }: CommentsSectionProps) {
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [editing, setEditing] = useState(false);

  const invalidate = () => {
    if (isCompleted) {
      qc.invalidateQueries({ queryKey: ['fightReviews', fightId] });
      qc.invalidateQueries({ queryKey: ['fight', fightId] });
      qc.invalidateQueries({ queryKey: ['fightStats', fightId] });
    } else {
      qc.invalidateQueries({ queryKey: ['preFightComments', fightId] });
    }
  };

  // Patch a single item's upvote state in place. We deliberately do NOT
  // invalidate/refetch here so the list does not re-sort while the user is
  // reading it — order only changes on a fresh page load.
  const patchUpvote = (itemId: string, upvotes: number, userHasUpvoted: boolean) => {
    const apply = (it: any) =>
      it && it.id === itemId ? { ...it, upvotes, userHasUpvoted } : it;
    if (isCompleted) {
      qc.setQueryData(['fightReviews', fightId], (old: any) =>
        old ? { ...old, reviews: (old.reviews ?? []).map(apply) } : old,
      );
      qc.setQueryData(['fight', fightId], (old: any) =>
        old?.fight?.userReview ? { ...old, fight: { ...old.fight, userReview: apply(old.fight.userReview) } } : old,
      );
    } else {
      qc.setQueryData(['preFightComments', fightId], (old: any) =>
        old
          ? { ...old, comments: (old.comments ?? []).map(apply), userComment: apply(old.userComment) }
          : old,
      );
    }
  };

  const handleUpvote = async (itemId: string, current: { upvotes: number; userHasUpvoted: boolean }) => {
    if (!isAuthenticated) return;
    // Optimistic in-place toggle (no reorder).
    const optimistic = !current.userHasUpvoted;
    patchUpvote(itemId, current.upvotes + (optimistic ? 1 : -1), optimistic);
    try {
      const res: any = isCompleted
        ? await toggleReviewUpvote(fightId, itemId)
        : await togglePreFightCommentUpvote(fightId, itemId);
      // Reconcile with the server's authoritative counts, still in place.
      const upvotes = res.upvotesCount ?? res.upvotes;
      const voted = res.isUpvoted ?? res.userHasUpvoted;
      if (typeof upvotes === 'number' && typeof voted === 'boolean') {
        patchUpvote(itemId, upvotes, voted);
      }
    } catch {
      // Roll back on failure.
      patchUpvote(itemId, current.upvotes, current.userHasUpvoted);
    }
  };

  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ['fightReviews', fightId],
    queryFn: () => getFightReviews(fightId),
    enabled: isCompleted,
  });

  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ['preFightComments', fightId],
    queryFn: () => getFightPreFightComments(fightId),
    enabled: !isCompleted,
  });

  const isLoading = isCompleted ? reviewsLoading : commentsLoading;

  const allItems: any[] = isCompleted ? reviewsData?.reviews ?? [] : commentsData?.comments ?? [];
  // The user's own comment/review, surfaced from the dedicated field when present.
  const myItem =
    (isCompleted ? myReviewFromFight : commentsData?.userComment) ||
    (currentUserId ? allItems.find((i) => (i.user?.id ?? i.userId) === currentUserId) : null) ||
    null;
  const others = allItems.filter((i) => i.id !== myItem?.id).slice(0, 10);

  // Create/update/delete the user's own comment. Empty content deletes (matches mobile).
  const saveMine = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed && myItem) {
      // Deletion path — confirm exactly like the mobile app.
      const ok = typeof window !== 'undefined'
        && window.confirm('Are you sure you want to delete your comment?');
      if (!ok) return;
      if (isCompleted) await updateFightUserData(fightId, { review: null });
      else await updatePreFightComment(fightId, myItem.id, '');
    } else if (!trimmed) {
      return; // nothing to post
    } else if (isCompleted) {
      await updateFightUserData(fightId, { review: trimmed });
    } else if (myItem) {
      await updatePreFightComment(fightId, myItem.id, trimmed);
    } else {
      await createPreFightComment(fightId, trimmed);
    }
    setEditing(false);
    invalidate();
  };

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-text-secondary" /></div>;
  }

  return (
    <div className="space-y-2">
      {/* The user's own comment is pinned to the top, with inline edit/update.
          When the user has NOT posted yet, we show nothing here — adding a
          comment happens through the rate/hype modal, not an inline composer. */}
      {isAuthenticated && myItem && (
        editing ? (
          <MyCommentEditor
            key={myItem.content || 'edit'}
            initialContent={myItem.content || ''}
            placeholder={isCompleted ? 'Write a review…' : 'Share your thoughts on this upcoming fight…'}
            hasExisting
            onCancel={() => setEditing(false)}
            onSave={saveMine}
          />
        ) : (
          <CommentCard
            item={myItem}
            isMine
            onUpvote={() => handleUpvote(myItem.id, { upvotes: myItem.upvotes ?? 0, userHasUpvoted: !!myItem.userHasUpvoted })}
            onEdit={() => setEditing(true)}
          />
        )
      )}

      {others.map((item) => (
        <CommentCard
          key={item.id}
          item={item}
          onUpvote={() => handleUpvote(item.id, { upvotes: item.upvotes ?? 0, userHasUpvoted: !!item.userHasUpvoted })}
        />
      ))}

      {!myItem && others.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-4 text-center text-sm text-text-secondary">
          No {isCompleted ? 'reviews' : 'comments'} yet.
        </p>
      )}
    </div>
  );
}

/** Inline editor for the user's own comment. Submitting empty content triggers
 *  the delete-confirm flow in the parent. */
function MyCommentEditor({
  initialContent,
  placeholder,
  hasExisting,
  onSave,
  onCancel,
}: {
  initialContent: string;
  placeholder: string;
  hasExisting: boolean;
  onSave: (content: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(content);
    } finally {
      setSaving(false);
    }
  };

  const emptied = hasExisting && !content.trim();

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        maxLength={1000}
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-background p-2.5 text-sm text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-foreground"
          >
            Cancel
          </button>
        )}
        <button
          onClick={submit}
          disabled={saving || (!hasExisting && !content.trim())}
          className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            emptied ? 'bg-danger text-white hover:bg-danger/90' : 'bg-primary text-text-on-accent hover:bg-primary/90'
          }`}
        >
          {saving ? 'Saving…' : emptied ? 'Delete' : hasExisting ? 'Update' : 'Post'}
        </button>
      </div>
    </div>
  );
}
