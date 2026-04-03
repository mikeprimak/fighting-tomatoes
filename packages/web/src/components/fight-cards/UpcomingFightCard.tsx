'use client';

import Link from 'next/link';
import { Flame } from 'lucide-react';
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

interface UpcomingFightCardProps {
  fight: {
    id: string;
    fighter1: Fighter;
    fighter2: Fighter;
    weightClass?: string;
    isTitle: boolean;
    titleName?: string;
    fighter1Odds?: string;
    fighter2Odds?: string;
    averageHype?: number;
    totalHypePredictions?: number;
    userHypeScore?: number;
    totalPreFightComments?: number;
  };
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

export function UpcomingFightCard({ fight }: UpcomingFightCardProps) {
  const hypeColor = fight.averageHype ? getHypeHeatmapColor(fight.averageHype) : undefined;

  return (
    <Link href={`/fights/${fight.id}`} className="block">
      <div className="group rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30 sm:p-4">
        {/* Title badge */}
        {fight.isTitle && (
          <div className="mb-2 text-center">
            <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {fight.titleName || 'TITLE FIGHT'}
            </span>
          </div>
        )}

        {/* Fighters row */}
        <div className="flex items-center justify-between">
          <FighterImage fighter={fight.fighter1} />

          {/* Center info */}
          <div className="flex flex-col items-center gap-1 px-2">
            {fight.weightClass && (
              <span className="text-[10px] text-text-secondary">{fight.weightClass}</span>
            )}
            <span className="text-xs font-bold text-text-secondary">VS</span>

            {/* Hype score */}
            {fight.averageHype != null && fight.averageHype > 0 && (
              <div className="flex items-center gap-1">
                <Flame size={12} style={{ color: hypeColor }} />
                <span className="text-sm font-bold" style={{ color: hypeColor }}>
                  {fight.averageHype.toFixed(1)}
                </span>
              </div>
            )}

            {/* Odds */}
            {(fight.fighter1Odds || fight.fighter2Odds) && (
              <div className="flex gap-2 text-[10px] text-text-secondary">
                {fight.fighter1Odds && <span>{fight.fighter1Odds}</span>}
                {fight.fighter2Odds && <span>{fight.fighter2Odds}</span>}
              </div>
            )}
          </div>

          <FighterImage fighter={fight.fighter2} />
        </div>
      </div>
    </Link>
  );
}
