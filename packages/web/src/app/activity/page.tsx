'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getMyRatings } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const TABS = [
  { value: 'all', label: 'All Ratings' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'tagged', label: 'Tagged' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'highest', label: 'Highest Rated' },
  { value: 'lowest', label: 'Lowest Rated' },
];

export default function ActivityPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('recent');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['myRatings', filterType, sortBy],
    queryFn: ({ pageParam = '1' }) =>
      getMyRatings({ page: pageParam, limit: '20', filterType, sortBy }),
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

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/profile" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={14} />
        Profile
      </Link>
      <h1 className="mb-4 text-lg font-bold">My Activity</h1>

      {/* Tabs */}
      <div className="mb-3 flex gap-1.5">
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

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fights.map((fight: any) => (
          <CompletedFightCard key={fight.id} fight={fight} />
        ))}
      </div>

      {!isLoading && fights.length === 0 && (
        <p className="py-12 text-center text-sm text-text-secondary">
          {filterType === 'all' ? "You haven't rated any fights yet." : `No ${filterType} fights found.`}
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
