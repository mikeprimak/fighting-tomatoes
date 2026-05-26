'use client';

import { Suspense, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getMyRatings } from '@/lib/api';
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

  const currentTab = TABS.find(t => t.value === filterType) ?? TABS[0];
  const isCommentTab = currentTab.kind === 'comment';

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['myRatings', filterType, sortBy],
    queryFn: ({ pageParam = '1' }) => {
      const apiFilter = currentTab.api;
      const apiSort = SORT_OPTIONS.find(s => s.value === sortBy)?.api ?? 'newest';
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

  // For comment tabs, flatten each fight's comments into individual cards.
  const comments = isCommentTab
    ? fights.flatMap((fight: any) => {
        const list: any[] = filterType === 'preFight'
          ? (fight.preFightComments ?? [])
          : (fight.userReviews ?? []);
        return list
          .filter((c) => c?.content?.trim())
          .map((c) => ({ ...c, fight }));
      })
    : [];

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

      {/* Sort (fight tabs only — comment tabs are date-ordered) */}
      {!isCommentTab && (
        <div className="mb-4 flex gap-1.5">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                sortBy === opt.value ? 'bg-primary text-text-on-accent' : 'bg-card text-text-secondary hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Comment tabs: render comment cards */}
      {isCommentTab && comments.length > 0 && (
        <div className="space-y-2">
          {comments.map((c: any) => (
            <ActivityCommentCard key={c.id} comment={c} kind={filterType === 'preFight' ? 'pre' : 'post'} />
          ))}
        </div>
      )}

      {/* Fight tabs: render fight cards */}
      {!isCommentTab && fights.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {fights.map((fight: any) => (
            fight.fightStatus === 'COMPLETED'
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

function ActivityCommentCard({ comment, kind }: { comment: any; kind: 'pre' | 'post' }) {
  const fight = comment.fight ?? {};
  const f1 = fight.fighter1?.lastName ?? '';
  const f2 = fight.fighter2?.lastName ?? '';
  const matchup = f1 && f2 ? `${f1} vs ${f2}` : (fight.event?.name ?? '');

  // Reuse the shared CommentCard. Pre-fight comments surface the user's own hype
  // next to their name; post-fight comments surface the review rating.
  const item = {
    ...comment,
    rating: kind === 'post' ? comment.rating : null,
    hypeRating: kind === 'pre' ? (fight.userHypePrediction ?? null) : null,
  };

  return (
    <div>
      <Link
        href={`/fights/${fight.id}`}
        className="mb-1 flex items-center gap-2 px-1 text-[10px] uppercase tracking-wider text-text-secondary hover:text-primary"
      >
        <span className="truncate font-semibold">{matchup}</span>
        {fight.event?.name && matchup !== fight.event.name && (
          <span className="truncate">· {fight.event.name}</span>
        )}
      </Link>
      <CommentCard item={item} isMine />
    </div>
  );
}
