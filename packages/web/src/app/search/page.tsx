'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { search } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FighterAvatar } from '@/components/FighterAvatar';
import { formatRecord } from '@/lib/record';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { formatEventDate } from '@/utils/dateFormatters';
import { Loader2, Search as SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

// Weight classes are stored as uppercase enums (e.g. LIGHT_HEAVYWEIGHT).
function formatWeightClass(wc?: string | null): string {
  if (!wc) return '';
  return wc
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const { isLoading: authLoading } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query, 20),
    enabled: !authLoading && query.length >= 2,
  });

  if (!query || query.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <SearchIcon className="mb-3 text-text-secondary" size={32} />
        <p className="text-text-secondary">Enter at least 2 characters to search</p>
      </div>
    );
  }

  // While auth resolves the query is disabled, so React Query reports
  // isLoading=false (pending+idle). Treat "no data yet, no error" as loading
  // too, otherwise we flash "No results found" before the fetch runs.
  if (authLoading || isLoading || (!data && !error)) {
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
  const featured = results?.featured ?? null;
  const fights = results?.fights ?? [];
  const events = results?.events ?? [];
  const promotions = results?.promotions ?? [];

  // The featured fighter and their featured fight get their own hero block —
  // drop them from the regular lists to avoid duplicates.
  const fighters = (results?.fighters ?? []).filter(
    (f: any) => f.id !== featured?.fighter?.id
  );
  const featuredFightId = featured?.nextFight?.id ?? featured?.lastFight?.id ?? null;
  const visibleFights = fights.filter((f: any) => f.id !== featuredFightId);
  const upcomingFights = visibleFights.filter((f: any) => f.fightStatus === 'UPCOMING' || f.fightStatus === 'SCHEDULED' || f.fightStatus === 'LIVE');
  const completedFights = visibleFights.filter((f: any) => f.fightStatus === 'COMPLETED');

  const hasResults =
    !!featured || fighters.length > 0 || fights.length > 0 || events.length > 0 || promotions.length > 0;

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

      {/* Featured fighter — shown when the query clearly targets one fighter */}
      {featured && featured.type === 'fighter' && (
        <div className="mb-6">
          <Link href={`/fighters/${featured.fighter.id}`} className="block">
            <div className="flex items-center gap-4 rounded-lg border border-primary/40 bg-card p-4 transition-colors hover:border-primary sm:p-5">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-background sm:h-24 sm:w-24">
                <FighterAvatar
                  src={featured.fighter.profileImage}
                  initials={`${featured.fighter.firstName?.[0] ?? ''}${featured.fighter.lastName?.[0] ?? ''}`}
                  imgClassName="h-full w-full object-cover"
                  initialsClassName="flex h-full w-full items-center justify-center text-xl font-bold text-text-secondary"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold sm:text-xl">
                  {featured.fighter.firstName} {featured.fighter.lastName}
                </p>
                {featured.fighter.nickname && (
                  <p className="truncate text-sm italic text-text-secondary">
                    &quot;{featured.fighter.nickname}&quot;
                  </p>
                )}
                <p className="mt-1 text-sm text-text-secondary">
                  {[
                    featured.fighter.record || formatRecord(featured.fighter),
                    formatWeightClass(featured.fighter.weightClass),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {featured.fighter.isChampion && (
                  <p className="mt-1 text-sm font-semibold text-primary">
                    🏆 {featured.fighter.championshipTitle || 'Champion'}
                  </p>
                )}
              </div>
            </div>
          </Link>

          {featured.nextFight && (
            <div className="mt-3">
              <h2 className="mb-2 text-sm font-semibold text-text-secondary">NEXT FIGHT</h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <UpcomingFightCard fight={featured.nextFight} />
              </div>
            </div>
          )}
          {!featured.nextFight && featured.lastFight && (
            <div className="mt-3">
              <h2 className="mb-2 text-sm font-semibold text-text-secondary">LAST FIGHT</h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <CompletedFightCard fight={featured.lastFight} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fighters */}
      {fighters.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">
            {featured ? 'OTHER FIGHTERS' : 'FIGHTERS'} ({fighters.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fighters.map((fighter: any) => (
              <Link key={fighter.id} href={`/fighters/${fighter.id}`} className="block">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-background">
                    <FighterAvatar
                      src={fighter.profileImage}
                      initials={`${fighter.firstName[0]}${fighter.lastName[0]}`}
                      imgClassName="h-full w-full object-cover"
                      initialsClassName="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{fighter.firstName} {fighter.lastName}</p>
                    <p className="text-xs text-text-secondary">
                      {fighter.record || formatRecord(fighter) || ''}
                      {(fighter.record || formatRecord(fighter)) && fighter.weightClass ? ' - ' : ''}
                      {formatWeightClass(fighter.weightClass)}
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
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
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
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
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

      {/* Promotions */}
      {promotions.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">
            PROMOTIONS ({promotions.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {promotions.map((promotion: any) => (
              <div
                key={promotion.name}
                className="rounded-lg border border-border bg-card p-3"
              >
                <p className="text-sm font-medium">{promotion.name}</p>
                <p className="text-xs text-text-secondary">
                  {promotion.totalEvents} total events · {promotion.upcomingEvents} upcoming
                </p>
              </div>
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
