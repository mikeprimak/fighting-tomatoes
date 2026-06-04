'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getTopRecentFights } from '@/lib/api';
import { useOrgFilter } from '@/lib/orgFilter';
import { OrgFilterTabs } from '@/components/layout/OrgFilterTabs';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { LoadMoreSentinel } from '@/components/layout/LoadMoreSentinel';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { Loader2, Trophy } from 'lucide-react';

const PAGE_SIZE = 25;

const TIME_PERIODS = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: '3months', label: '3 Months' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

export default function TopFightsPage() {
  return (
    <Suspense
      fallback={
        <SidebarLayout>
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </SidebarLayout>
      }
    >
      <TopFightsPageInner />
    </Suspense>
  );
}

function TopFightsPageInner() {
  const searchParams = useSearchParams();
  // Allow deep links like /fights/top?period=all (e.g. the home "Classic Good
  // Fights" See all). Fall back to This Month for an unknown/absent param.
  const initialPeriod = (() => {
    const p = searchParams.get('period');
    return TIME_PERIODS.some(tp => tp.value === p) ? (p as string) : 'month';
  })();
  const [period, setPeriod] = useState(initialPeriod);
  const { selectedOrgs } = useOrgFilter();

  const promotions = selectedOrgs.size > 0 ? Array.from(selectedOrgs).join(',') : undefined;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['topFights', period, promotions],
    queryFn: ({ pageParam = 1 }) =>
      getTopRecentFights(period, promotions, pageParam as number, PAGE_SIZE),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.pagination?.hasMore ? allPages.length + 1 : undefined,
    initialPageParam: 1,
  });

  const fights = data?.pages.flatMap(p => p.data) ?? [];

  return (
    <SidebarLayout>
        <div className="mb-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="text-primary" size={20} />
            <h1 className="text-lg font-bold text-foreground">Good Fights</h1>
          </div>
          <OrgFilterTabs />
        </div>

        {/* Time period filter */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto">
          {TIME_PERIODS.map(tp => (
            <button
              key={tp.value}
              onClick={() => setPeriod(tp.value)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                period === tp.value
                  ? 'bg-primary text-text-on-accent'
                  : 'bg-card text-text-secondary hover:text-foreground'
              }`}
            >
              {tp.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-center text-sm text-danger">
            Failed to load fights.
          </div>
        )}

        {fights.length > 0 && (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {fights.map((fight: any, index: number) => (
              <CompletedFightCard key={fight.id} fight={fight} showRank={index + 1} showEvent />
            ))}
          </div>
        )}

        <LoadMoreSentinel
          hasMore={!!hasNextPage}
          isFetching={isFetchingNextPage}
          onIntersect={() => fetchNextPage()}
        />

        {!isLoading && fights.length === 0 && !error && (
          <p className="py-12 text-center text-sm text-text-secondary">
            No rated fights found for this period.
          </p>
        )}
    </SidebarLayout>
  );
}
