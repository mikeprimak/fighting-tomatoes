'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { useSpoilerFree } from '@/lib/spoilerFree';

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

interface CompletedFightCardProps {
  fight: {
    id: string;
    fighter1: Fighter;
    fighter2: Fighter;
    weightClass?: string;
    isTitle: boolean;
    titleName?: string;
    winner?: string;
    method?: string;
    round?: number;
    time?: string;
    averageRating: number;
    totalRatings: number;
    userRating?: number;
    fightStatus: string;
  };
  showRank?: number;
}

function FighterImage({ fighter, isWinner, hideSpoilers }: { fighter: Fighter; isWinner: boolean; hideSpoilers: boolean }) {
  const imgSrc = fighter.profileImage || '';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`h-16 w-16 overflow-hidden rounded-full sm:h-20 sm:w-20 ${
        !hideSpoilers && isWinner ? 'ring-2 ring-success' : 'bg-card'
      }`}>
        {imgSrc ? (
          <img src={imgSrc} alt={`${fighter.firstName} ${fighter.lastName}`} className={`h-full w-full object-cover ${
            !hideSpoilers && !isWinner && fighter.id ? 'opacity-60' : ''
          }`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-text-secondary">
            {fighter.firstName[0]}{fighter.lastName[0]}
          </div>
        )}
      </div>
      <span className={`max-w-[90px] truncate text-center text-xs font-medium sm:max-w-[120px] sm:text-sm ${
        !hideSpoilers && isWinner ? 'text-success' : 'text-foreground'
      }`}>
        {fighter.lastName}
      </span>
      <span className="text-[10px] text-text-secondary sm:text-xs">
        {fighter.wins}-{fighter.losses}-{fighter.draws}
      </span>
    </div>
  );
}

export function CompletedFightCard({ fight, showRank }: CompletedFightCardProps) {
  const { spoilerFreeMode } = useSpoilerFree();
  const hideSpoilers = spoilerFreeMode && !fight.userRating;
  const ratingColor = fight.averageRating > 0 ? getHypeHeatmapColor(fight.averageRating) : undefined;

  const isWinner1 = fight.winner === fight.fighter1.id;
  const isWinner2 = fight.winner === fight.fighter2.id;

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
          <FighterImage fighter={fight.fighter1} isWinner={isWinner1} hideSpoilers={hideSpoilers} />

          {/* Center info */}
          <div className="flex flex-col items-center gap-1 px-2">
            {fight.weightClass && (
              <span className="text-[10px] text-text-secondary">{fight.weightClass}</span>
            )}

            {/* Method */}
            {!hideSpoilers && fight.method && (
              <span className="text-[10px] font-medium text-text-secondary">
                {fight.method}{fight.round ? ` R${fight.round}` : ''}
              </span>
            )}

            {hideSpoilers && (
              <span className="text-xs text-text-secondary">RESULT HIDDEN</span>
            )}

            {/* Community rating */}
            {fight.averageRating > 0 && (
              <div className="flex items-center gap-1">
                <Star size={12} style={{ color: ratingColor }} fill={ratingColor} />
                <span className="text-sm font-bold" style={{ color: ratingColor }}>
                  {fight.averageRating.toFixed(1)}
                </span>
                <span className="text-[10px] text-text-secondary">
                  ({fight.totalRatings})
                </span>
              </div>
            )}

            {/* User rating */}
            {fight.userRating && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-secondary">YOU:</span>
                <span className="text-xs font-bold" style={{ color: getHypeHeatmapColor(fight.userRating) }}>
                  {fight.userRating}
                </span>
              </div>
            )}

            {/* Rank */}
            {showRank && (
              <span className="text-xs font-bold text-primary">#{showRank}</span>
            )}
          </div>

          <FighterImage fighter={fight.fighter2} isWinner={isWinner2} hideSpoilers={hideSpoilers} />
        </div>
      </div>
    </Link>
  );
}
