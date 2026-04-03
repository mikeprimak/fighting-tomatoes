'use client';

import { useQuery } from '@tanstack/react-query';
import { getFighter, getFights } from '@/lib/api';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { formatEventDate } from '@/utils/dateFormatters';
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
  const fights = fightsData?.fights ?? [];

  const sortedFights = [...fights].sort((a: any, b: any) => {
    if (sortBy === 'rating') {
      return (b.averageRating || 0) - (a.averageRating || 0);
    }
    return new Date(b.event?.date || 0).getTime() - new Date(a.event?.date || 0).getTime();
  });

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

      {/* Sort */}
      <div className="mb-4 flex items-center gap-2">
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

      {/* Fights list */}
      <div className="space-y-2">
        {sortedFights.map((fight: any) => {
          const opponent = fight.fighter1.id === fighterId ? fight.fighter2 : fight.fighter1;
          const isCompleted = fight.fightStatus === 'COMPLETED';
          const isWinner = fight.winner === fighterId;
          const ratingColor = fight.averageRating > 0 ? getHypeHeatmapColor(fight.averageRating) : undefined;

          return (
            <Link key={fight.id} href={`/fights/${fight.id}`} className="block">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30">
                {/* Opponent image */}
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-background">
                  {opponent.profileImage ? (
                    <img src={opponent.profileImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary">
                      {opponent.firstName[0]}{opponent.lastName[0]}
                    </div>
                  )}
                </div>

                {/* Fight info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {isCompleted && (
                      <span className={`text-xs font-bold ${isWinner ? 'text-success' : 'text-danger'}`}>
                        {isWinner ? 'W' : 'L'}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium">
                      vs {opponent.firstName} {opponent.lastName}
                    </span>
                  </div>
                  <p className="truncate text-xs text-text-secondary">
                    {fight.event?.name} - {fight.event?.date ? formatEventDate(fight.event.date) : ''}
                  </p>
                </div>

                {/* Rating */}
                {isCompleted && fight.averageRating > 0 && (
                  <div className="text-right">
                    <span className="text-sm font-bold" style={{ color: ratingColor }}>
                      {fight.averageRating.toFixed(1)}
                    </span>
                    <p className="text-[10px] text-text-secondary">{fight.totalRatings} ratings</p>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {sortedFights.length === 0 && (
        <p className="py-8 text-center text-sm text-text-secondary">No fights found.</p>
      )}
    </div>
  );
}
