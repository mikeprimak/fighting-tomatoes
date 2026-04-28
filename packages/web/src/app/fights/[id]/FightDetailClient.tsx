'use client';

import { useQuery } from '@tanstack/react-query';
import { getFight, getFightAggregateStats, getFightReviews, getFightPreFightComments } from '@/lib/api';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { formatEventDate } from '@/utils/dateFormatters';
import { useSpoilerFree } from '@/lib/spoilerFree';
import { useAuth } from '@/lib/auth';
import { Flame, Star, MessageSquare, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DistributionChart } from '@/components/charts/DistributionChart';
import { RateFightModal } from '@/components/RateFightModal';
import { HypeFightModal } from '@/components/HypeFightModal';
import { CommentForm } from '@/components/CommentForm';
import { createPreFightComment, reviewFight, toggleReviewUpvote, togglePreFightCommentUpvote } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  fightId: string;
  initialFight: any;
}

function FighterDisplay({ fighter, isWinner, hideSpoilers }: { fighter: any; isWinner: boolean; hideSpoilers: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`h-24 w-24 overflow-hidden rounded-full sm:h-32 sm:w-32 ${
        !hideSpoilers && isWinner ? 'ring-3 ring-success' : 'bg-card'
      }`}>
        {fighter.profileImage ? (
          <img
            src={fighter.profileImage}
            alt={`${fighter.firstName} ${fighter.lastName}`}
            className={`h-full w-full object-cover ${!hideSpoilers && !isWinner && fighter.id ? 'opacity-60' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-text-secondary">
            {fighter.firstName[0]}{fighter.lastName[0]}
          </div>
        )}
      </div>
      <Link href={`/fighters/${fighter.id}`} className="text-center hover:text-primary">
        <p className={`text-sm font-bold sm:text-base ${!hideSpoilers && isWinner ? 'text-success' : ''}`}>
          {fighter.firstName} {fighter.lastName}
        </p>
        {fighter.nickname && (
          <p className="text-xs text-text-secondary">&quot;{fighter.nickname}&quot;</p>
        )}
      </Link>
      <p className="text-xs text-text-secondary">
        {fighter.wins}-{fighter.losses}-{fighter.draws}
      </p>
    </div>
  );
}

export function FightDetailClient({ fightId, initialFight }: Props) {
  const { spoilerFreeMode } = useSpoilerFree();
  const { isAuthenticated } = useAuth();
  const [outcomeRevealed, setOutcomeRevealed] = useState(false);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [hypeModalOpen, setHypeModalOpen] = useState(false);
  const queryClient = useQueryClient();

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

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back */}
      <Link href={fight.event?.id ? `/events/${fight.event.id}` : '/'} className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={14} />
        {fight.event?.name || 'Back'}
      </Link>

      {/* Fighters */}
      <div className="mb-6 flex items-start justify-center gap-6 sm:gap-12">
        <FighterDisplay fighter={fight.fighter1} isWinner={isWinner1} hideSpoilers={hideSpoilers} />
        <div className="flex flex-col items-center gap-1 pt-8">
          <span className="text-lg font-bold text-text-secondary">VS</span>
          {fight.weightClass && (
            <span className="text-xs text-text-secondary">{fight.weightClass}</span>
          )}
          {fight.isTitle && (
            <span className="mt-1 rounded bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {fight.titleName || 'TITLE FIGHT'}
            </span>
          )}
        </div>
        <FighterDisplay fighter={fight.fighter2} isWinner={isWinner2} hideSpoilers={hideSpoilers} />
      </div>

      {/* Result (completed) */}
      {isCompleted && !hideSpoilers && fight.method && (
        <div className="mb-4 text-center">
          <p className="text-sm font-medium text-text-secondary">
            {fight.method}{fight.round ? ` — Round ${fight.round}` : ''}{fight.time ? ` (${fight.time})` : ''}
          </p>
        </div>
      )}

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
              <DistributionChart distribution={stats.hypeDistribution} label="Hype" />
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
              <DistributionChart distribution={stats.ratingDistribution} label="Rating" />
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
        {isUpcoming && (
          <CommentForm
            placeholder="Share your thoughts on this upcoming fight..."
            onSubmit={async (content) => {
              await createPreFightComment(fightId, content);
              queryClient.invalidateQueries({ queryKey: ['preFightComments', fightId] });
            }}
          />
        )}
        {isCompleted && (
          <CommentForm
            placeholder="Write a review..."
            onSubmit={async (content) => {
              await reviewFight(fightId, { content, rating: fight.userRating || 5 });
              queryClient.invalidateQueries({ queryKey: ['fightReviews', fightId] });
            }}
          />
        )}
        <CommentsSection fightId={fightId} isCompleted={isCompleted} />
      </div>

      {/* Modals */}
      <RateFightModal
        isOpen={rateModalOpen}
        onClose={() => setRateModalOpen(false)}
        fight={fight}
        existingRating={fight.userRating}
        existingReview={fight.userReview}
        existingTags={fight.userTags}
      />
      <HypeFightModal
        isOpen={hypeModalOpen}
        onClose={() => setHypeModalOpen(false)}
        fight={fight}
        existingHype={stats?.userHypeScore ?? undefined}
      />
    </div>
  );
}

function CommentsSection({ fightId, isCompleted }: { fightId: string; isCompleted: boolean }) {
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();

  const handleUpvote = async (itemId: string) => {
    if (!isAuthenticated) return;
    try {
      if (isCompleted) {
        await toggleReviewUpvote(fightId, itemId);
        qc.invalidateQueries({ queryKey: ['fightReviews', fightId] });
      } else {
        await togglePreFightCommentUpvote(fightId, itemId);
        qc.invalidateQueries({ queryKey: ['preFightComments', fightId] });
      }
    } catch { /* ignore */ }
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

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-text-secondary" /></div>;
  }

  const items = isCompleted ? reviewsData?.reviews ?? [] : commentsData?.comments ?? [];

  if (items.length === 0) {
    return <p className="rounded-lg border border-border bg-card p-4 text-center text-sm text-text-secondary">No {isCompleted ? 'reviews' : 'comments'} yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 10).map((item: any) => (
        <div key={item.id} className="rounded-lg border border-border bg-card p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium">{item.user?.displayName || 'Anonymous'}</span>
            {item.rating && (
              <span className="text-xs font-bold" style={{ color: getHypeHeatmapColor(item.rating) }}>
                {item.rating}/10
              </span>
            )}
            {item.hypeRating && (
              <span className="flex items-center gap-0.5 text-xs font-bold" style={{ color: getHypeHeatmapColor(item.hypeRating) }}>
                <Flame size={10} />
                {item.hypeRating}
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary">{item.content}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-text-secondary">
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
            {item.upvotes != null && (
              <button
                onClick={() => handleUpvote(item.id)}
                className={`hover:text-primary ${item.userHasUpvoted ? 'text-primary font-semibold' : ''}`}
              >
                {item.upvotes} upvote{item.upvotes !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
