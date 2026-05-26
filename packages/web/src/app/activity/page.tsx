'use client';

import { Suspense, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getMyRatings, toggleReviewUpvote, togglePreFightCommentUpvote } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CommentCard } from '@/components/CommentCard';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

// Frontend tab/sort values are semantic and map to the backend's enum values
// (the backend zod schema rejects anything outside its enums, which silently
// 500s the request — that's why this page used to render empty).
const TABS = [
  { value: 'all', label: 'Rated', api: 'ratings', kind: 'fight' as const },
  { value: 'hype', label: 'Hyped', api: 'hype', kind: 'fight' as const },
  { value: 'preFight', label: 'Pre-fight comments', api: 'preFightComments', kind: 'comment' as const },
  { value: 'comments', label: 'Post-fight comments', api: 'comments', kind: 'comment' as const },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent', api: 'newest' },
  { value: 'highest', label: 'Highest Rated', api: 'rating' },
];

const COMMENT_SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'upvoted', label: 'Most Upvoted' },
];

type VoteState = { upvotes: number; userHasUpvoted: boolean };

export default function ActivityPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <ActivityPageInner />
    </Suspense>
  );
}

function ActivityPageInner() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilter = (() => {
    const f = searchParams.get('filter');
    return TABS.some(t => t.value === f) ? (f as string) : 'all';
  })();
  const [filterType, setFilterType] = useState(initialFilter);
  const [sortBy, setSortBy] = useState('recent');
  const [commentSort, setCommentSort] = useState('recent');
  // Optimistic upvote overrides keyed by comment id (survive list refetches).
  const [voteOverrides, setVoteOverrides] = useState<Record<string, VoteState>>({});

  const currentTab = TABS.find(t => t.value === filterType) ?? TABS[0];
  const isCommentTab = currentTab.kind === 'comment';

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    // Comment tabs are always fetched newest-first; their ordering is applied
    // client-side from commentSort, so the fetch sort stays stable.
    queryKey: ['myRatings', filterType, isCommentTab ? 'newest' : sortBy],
    queryFn: ({ pageParam = '1' }) => {
      const apiFilter = currentTab.api;
      const apiSort = isCommentTab
        ? 'newest'
        : (SORT_OPTIONS.find(s => s.value === sortBy)?.api ?? 'newest');
      return getMyRatings({ page: pageParam, limit: '20', filterType: apiFilter, sortBy: apiSort });
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? String(page + 1) : undefined;
    },
    initialPageParam: '1',
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  const fights = data?.pages.flatMap(p => p.fights) ?? [];

  // For comment tabs, flatten each fight's comments into normalized cards.
  const isPre = filterType === 'preFight';
  let comments = isCommentTab
    ? fights.flatMap((fight: any) => {
        const list: any[] = isPre ? (fight.preFightComments ?? []) : (fight.userReviews ?? []);
        return list
          .filter((c) => c?.content?.trim())
          .map((c) => {
            const override = voteOverrides[c.id];
            const baseUpvoted = isPre ? (c.votes?.length ?? 0) > 0 : !!c.userHasUpvoted;
            return {
              id: c.id,
              fightId: fight.id,
              fight,
              content: c.content,
              createdAt: c.createdAt,
              rating: isPre ? null : (c.rating ?? null),
              hypeRating: isPre ? (fight.userHypePrediction ?? null) : null,
              upvotes: override?.upvotes ?? c.upvotes ?? 0,
              userHasUpvoted: override?.userHasUpvoted ?? baseUpvoted,
            };
          });
      })
    : [];

  if (isCommentTab) {
    comments = [...comments].sort((a, b) =>
      commentSort === 'upvoted'
        ? (b.upvotes - a.upvotes) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  const handleUpvote = async (comment: any) => {
    const current: VoteState = { upvotes: comment.upvotes ?? 0, userHasUpvoted: !!comment.userHasUpvoted };
    const optimistic = !current.userHasUpvoted;
    setVoteOverrides(prev => ({
      ...prev,
      [comment.id]: { upvotes: current.upvotes + (optimistic ? 1 : -1), userHasUpvoted: optimistic },
    }));
    try {
      const res: any = isPre
        ? await togglePreFightCommentUpvote(comment.fightId, comment.id)
        : await toggleReviewUpvote(comment.fightId, comment.id);
      const upvotes = res.upvotesCount ?? res.upvotes;
      const voted = res.isUpvoted ?? res.userHasUpvoted;
      if (typeof upvotes === 'number' && typeof voted === 'boolean') {
        setVoteOverrides(prev => ({ ...prev, [comment.id]: { upvotes, userHasUpvoted: voted } }));
      }
    } catch {
      setVoteOverrides(prev => ({ ...prev, [comment.id]: current }));
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-lg font-bold">My Activity</h1>

      {/* Tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilterType(tab.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterType === tab.value ? 'bg-primary text-text-on-accent' : 'bg-card text-text-secondary hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="mb-4 flex gap-1.5">
        {(isCommentTab ? COMMENT_SORT_OPTIONS : SORT_OPTIONS).map(opt => {
          const active = isCommentTab ? commentSort === opt.value : sortBy === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => (isCommentTab ? setCommentSort(opt.value) : setSortBy(opt.value))}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active ? 'bg-primary text-text-on-accent' : 'bg-card text-text-secondary hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Comment tabs: render comment cards */}
      {isCommentTab && comments.length > 0 && (
        <div className="space-y-2">
          {comments.map((c: any) => (
            <ActivityCommentCard
              key={c.id}
              comment={c}
              onUpvote={() => handleUpvote(c)}
            />
          ))}
        </div>
      )}

      {/* Fight tabs: render fight cards. Rated fights are always completed-style
          (you can only rate a completed fight) — guards against fights whose
          fightStatus is stale-UPCOMING on an already-finished event. */}
      {!isCommentTab && fights.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {fights.map((fight: any) => (
            filterType === 'all' || fight.fightStatus === 'COMPLETED'
              ? <CompletedFightCard key={fight.id} fight={fight} />
              : <UpcomingFightCard key={fight.id} fight={fight} />
          ))}
        </div>
      )}

      {!isLoading && (isCommentTab ? comments.length === 0 : fights.length === 0) && (
        <p className="py-12 text-center text-sm text-text-secondary">
          {emptyMessage(filterType)}
        </p>
      )}

      {hasNextPage && (
        <div className="flex justify-center py-4">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-2 rounded-lg bg-card px-6 py-2 text-sm font-medium text-foreground hover:bg-border disabled:opacity-50"
          >
            {isFetchingNextPage ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading...</> : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}

function emptyMessage(filterType: string): string {
  switch (filterType) {
    case 'all': return "You haven't rated any fights yet.";
    case 'hype': return "You haven't hyped any fights yet.";
    case 'preFight': return "You haven't written any pre-fight comments yet.";
    case 'comments': return "You haven't written any post-fight comments yet.";
    default: return 'Nothing here yet.';
  }
}

function ActivityCommentCard({ comment, onUpvote }: { comment: any; onUpvote: () => void }) {
  const fight = comment.fight ?? {};
  const f1 = fight.fighter1?.lastName ?? '';
  const f2 = fight.fighter2?.lastName ?? '';
  const matchup = f1 && f2 ? `${f1} vs ${f2}` : (fight.event?.name ?? '');

  // The matchup + event live inside the card footer, next to the date.
  const meta = (
    <Link href={`/fights/${fight.id}`} className="flex min-w-0 items-center gap-1 uppercase tracking-wider hover:text-primary">
      <span className="truncate font-semibold">{matchup}</span>
      {fight.event?.name && matchup !== fight.event.name && (
        <span className="truncate">· {fight.event.name}</span>
      )}
    </Link>
  );

  return <CommentCard item={comment} isMine onUpvote={onUpvote} meta={meta} />;
}
