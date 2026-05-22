'use client';

import { useQuery } from '@tanstack/react-query';
import { getFighter, getFights } from '@/lib/api';
import { formatEventDate } from '@/utils/dateFormatters';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { Loader2, ArrowLeft, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface Props {
  fighterId: string;
  initialFighter: any;
}

export function FighterDetailClient({ fighterId, initialFighter }: Props) {
  const [sortBy, setSortBy] = useState<'rating' | 'date'>('date');

  const { data: fighterData, isLoading } = useQuery({
    queryKey: ['fighter', fighterId],
    queryFn: () => getFighter(fighterId),
    initialData: initialFighter ? { fighter: initialFighter } : undefined,
  });

  const { data: fightsData } = useQuery({
    queryKey: ['fighterFights', fighterId],
    queryFn: () => getFights({ fighterId, limit: 50, includeUserData: true }),
    enabled: !!fighterData,
  });

  const fighter = fighterData?.fighter;
  const allFights = fightsData?.fights ?? [];

  const upcomingFights = allFights.filter(
    (f: any) => f.fightStatus === 'UPCOMING' || f.fightStatus === 'LIVE',
  );
  const completedFights = [...allFights.filter((f: any) => f.fightStatus === 'COMPLETED')].sort(
    (a: any, b: any) => {
      if (sortBy === 'rating') {
        return (b.averageRating || 0) - (a.averageRating || 0);
      }
      return new Date(b.event?.date || 0).getTime() - new Date(a.event?.date || 0).getTime();
    },
  );

  if (isLoading || !fighter) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={14} />
        Back
      </Link>

      {/* Fighter header */}
      <div className="mb-6 flex items-center gap-4 sm:gap-6">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-card sm:h-32 sm:w-32">
          {fighter.profileImage ? (
            <img src={fighter.profileImage} alt={`${fighter.firstName} ${fighter.lastName}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-text-secondary">
              {fighter.firstName[0]}{fighter.lastName[0]}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {fighter.firstName} {fighter.lastName}
          </h1>
          {fighter.nickname && (
            <p className="text-sm text-text-secondary">&quot;{fighter.nickname}&quot;</p>
          )}
          <p className="mt-1 text-lg font-semibold">
            {fighter.wins}-{fighter.losses}-{fighter.draws}
          </p>
          {fighter.weightClass && (
            <p className="text-sm text-text-secondary">{fighter.weightClass}</p>
          )}
          {fighter.isChampion && fighter.championshipTitle && (
            <div className="mt-1 flex items-center gap-1">
              <Trophy size={14} className="text-primary" />
              <span className="text-xs font-medium text-primary">{fighter.championshipTitle}</span>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming section */}
      {upcomingFights.length > 0 && (
        <section className="mb-6">
          <SectionHeaderRow leftLabel="HYPE" rightLabel="MY HYPE" />
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {upcomingFights.map((fight: any) => (
              <FightWithEventLabel key={fight.id} fight={fight}>
                <UpcomingFightCard fight={fight} />
              </FightWithEventLabel>
            ))}
          </div>
        </section>
      )}

      {/* Completed section */}
      {completedFights.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <SectionHeaderRow leftLabel="RATING" rightLabel="MY RATING" />
          </div>

          {/* Sort */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-text-secondary">Sort by:</span>
            <button
              onClick={() => setSortBy('date')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${sortBy === 'date' ? 'bg-primary text-text-on-accent' : 'bg-card text-text-secondary'}`}
            >
              Date
            </button>
            <button
              onClick={() => setSortBy('rating')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${sortBy === 'rating' ? 'bg-primary text-text-on-accent' : 'bg-card text-text-secondary'}`}
            >
              Highest Rated
            </button>
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {completedFights.map((fight: any) => (
              <FightWithEventLabel key={fight.id} fight={fight}>
                <CompletedFightCard fight={fight} />
              </FightWithEventLabel>
            ))}
          </div>
        </section>
      )}

      {upcomingFights.length === 0 && completedFights.length === 0 && (
        <p className="py-8 text-center text-sm text-text-secondary">No fights found.</p>
      )}
    </div>
  );
}

function SectionHeaderRow({ leftLabel, rightLabel }: { leftLabel: string; rightLabel: string }) {
  return (
    <div className="mb-1 flex items-center justify-between px-2">
      <span className="w-12 text-center text-[10px] font-bold uppercase tracking-wider text-text-secondary">
        {leftLabel}
      </span>
      <span className="w-12 text-center text-[10px] font-bold uppercase tracking-wider text-text-secondary">
        {rightLabel}
      </span>
    </div>
  );
}

function FightWithEventLabel({ fight, children }: { fight: any; children: React.ReactNode }) {
  const eventName = fight.event?.name;
  const eventDate = fight.event?.date;
  if (!eventName && !eventDate) return <>{children}</>;
  return (
    <div>
      {(eventName || eventDate) && (
        <div className="flex items-center justify-between px-3 pt-2 text-[10px] uppercase tracking-wider text-text-secondary">
          <span className="truncate">{eventName}</span>
          {eventDate && <span className="shrink-0 pl-2">{formatEventDate(eventDate)}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
