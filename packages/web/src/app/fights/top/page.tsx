'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTopRecentFights } from '@/lib/api';
import { useOrgFilter } from '@/lib/orgFilter';
import { OrgFilterTabs } from '@/components/layout/OrgFilterTabs';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { Loader2, Trophy } from 'lucide-react';

const TIME_PERIODS = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: '3months', label: '3 Months' },
  { value: 'year', label: 'This Year' },
  { value: 'alltime', label: 'All Time' },
];

export default function TopFightsPage() {
  const [period, setPeriod] = useState('week');
  const { selectedOrgs } = useOrgFilter();

  const promotions = selectedOrgs.size > 0 ? Array.from(selectedOrgs).join(',') : undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ['topFights', period, promotions],
    queryFn: () => getTopRecentFights(period, promotions),
  });

  const fights = data?.data ?? [];

  return (
    <div>
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

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fights.map((fight: any, index: number) => (
          <CompletedFightCard key={fight.id} fight={fight} showRank={index + 1} />
        ))}
      </div>

      {!isLoading && fights.length === 0 && !error && (
        <p className="py-12 text-center text-sm text-text-secondary">
          No rated fights found for this period.
        </p>
      )}
    </div>
  );
}
