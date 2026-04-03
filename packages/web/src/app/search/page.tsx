'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { search } from '@/lib/api';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { formatEventDate } from '@/utils/dateFormatters';
import { Loader2, Search as SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query, 20),
    enabled: query.length >= 2,
  });

  if (!query || query.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <SearchIcon className="mb-3 text-text-secondary" size={32} />
        <p className="text-text-secondary">Enter at least 2 characters to search</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-center text-sm text-danger">
        Search failed. Please try again.
      </div>
    );
  }

  const results = data?.data;
  const fighters = results?.fighters ?? [];
  const fights = results?.fights ?? [];
  const events = results?.events ?? [];

  const upcomingFights = fights.filter((f: any) => f.fightStatus === 'UPCOMING' || f.fightStatus === 'SCHEDULED');
  const completedFights = fights.filter((f: any) => f.fightStatus === 'COMPLETED');

  const hasResults = fighters.length > 0 || fights.length > 0 || events.length > 0;

  if (!hasResults) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <SearchIcon className="mb-3 text-text-secondary" size={32} />
        <p className="text-text-secondary">No results found for &quot;{query}&quot;</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold">
        Search Results for &quot;{query}&quot;
      </h1>

      {/* Fighters */}
      {fighters.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">
            FIGHTERS ({fighters.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fighters.map((fighter: any) => (
              <Link key={fighter.id} href={`/fighters/${fighter.id}`} className="block">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-background">
                    {fighter.profileImage ? (
                      <img src={fighter.profileImage} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary">
                        {fighter.firstName[0]}{fighter.lastName[0]}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{fighter.firstName} {fighter.lastName}</p>
                    <p className="text-xs text-text-secondary">
                      {fighter.record || `${fighter.wins}-${fighter.losses}-${fighter.draws}`}
                      {fighter.weightClass ? ` - ${fighter.weightClass}` : ''}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Fights */}
      {upcomingFights.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">
            UPCOMING FIGHTS ({upcomingFights.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingFights.map((fight: any) => (
              <UpcomingFightCard key={fight.id} fight={fight} />
            ))}
          </div>
        </div>
      )}

      {/* Completed Fights */}
      {completedFights.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">
            COMPLETED FIGHTS ({completedFights.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {completedFights.map((fight: any) => (
              <CompletedFightCard key={fight.id} fight={fight} />
            ))}
          </div>
        </div>
      )}

      {/* Events */}
      {events.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">
            EVENTS ({events.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event: any) => (
              <Link key={event.id} href={`/events/${event.id}`} className="block">
                <div className="rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30">
                  <p className="text-sm font-medium">{event.name}</p>
                  <p className="text-xs text-text-secondary">
                    {event.promotion} - {formatEventDate(event.date)}
                  </p>
                  {event.venue && (
                    <p className="text-xs text-text-secondary">{event.venue}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <SearchResults />
    </Suspense>
  );
}
