'use client';

import Link from 'next/link';
import { getHypeHeatmapColor } from '@/utils/heatmap';

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  profileImage?: string;
  wins: number;
  losses: number;
  draws: number;
}

interface LiveFightCardProps {
  fight: {
    id: string;
    fighter1: Fighter;
    fighter2: Fighter;
    weightClass?: string;
    isTitle: boolean;
    titleName?: string;
    fightStatus: string;
    averageRating?: number;
    totalRatings?: number;
  };
  isUpNext?: boolean;
  isLiveNow?: boolean;
}

function FighterImage({ fighter }: { fighter: Fighter }) {
  const imgSrc = fighter.profileImage || '';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="h-16 w-16 overflow-hidden rounded-full bg-card sm:h-20 sm:w-20">
        {imgSrc ? (
          <img src={imgSrc} alt={`${fighter.firstName} ${fighter.lastName}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-text-secondary">
            {fighter.firstName[0]}{fighter.lastName[0]}
          </div>
        )}
      </div>
      <span className="max-w-[90px] truncate text-center text-xs font-medium text-foreground sm:max-w-[120px] sm:text-sm">
        {fighter.lastName}
      </span>
      <span className="text-[10px] text-text-secondary sm:text-xs">
        {fighter.wins}-{fighter.losses}-{fighter.draws}
      </span>
    </div>
  );
}

export function LiveFightCard({ fight, isUpNext, isLiveNow }: LiveFightCardProps) {
  return (
    <Link href={`/fights/${fight.id}`} className="block">
      <div className="group rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30 sm:p-4">
        {/* Status badge */}
        <div className="mb-2 text-center">
          {isLiveNow && (
            <span className="inline-flex items-center gap-1 rounded bg-danger/20 px-2 py-0.5 text-[10px] font-semibold text-danger">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
              LIVE NOW
            </span>
          )}
          {isUpNext && (
            <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
              UP NEXT
            </span>
          )}
          {fight.isTitle && (
            <span className="ml-1 rounded bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {fight.titleName || 'TITLE FIGHT'}
            </span>
          )}
        </div>

        {/* Fighters row */}
        <div className="flex items-center justify-between">
          <FighterImage fighter={fight.fighter1} />
          <div className="flex flex-col items-center gap-1 px-2">
            {fight.weightClass && (
              <span className="text-[10px] text-text-secondary">{fight.weightClass}</span>
            )}
            <span className="text-xs font-bold text-text-secondary">VS</span>
            {fight.averageRating != null && fight.averageRating > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold" style={{ color: getHypeHeatmapColor(fight.averageRating) }}>
                  {fight.averageRating.toFixed(1)}
                </span>
              </div>
            )}
          </div>
          <FighterImage fighter={fight.fighter2} />
        </div>
      </div>
    </Link>
  );
}
