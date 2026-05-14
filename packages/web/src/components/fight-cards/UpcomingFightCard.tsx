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

function FighterSide({ fighter, side }: { fighter: Fighter; side: 'left' | 'right' }) {
  const img = fighter.profileImage || '';
  const placeholder = `${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`.toUpperCase();

  const headshot = (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-background">
      {img ? (
        <img
          src={img}
          alt={`${fighter.firstName} ${fighter.lastName}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-text-secondary">
          {placeholder}
        </div>
      )}
    </div>
  );

  const names = (
    <div className={`flex min-w-0 flex-col ${side === 'left' ? 'items-end text-right' : 'items-start text-left'}`}>
      <span className="max-w-full truncate text-[11px] font-normal leading-tight text-text-secondary">
        {fighter.firstName}
      </span>
      <span className="max-w-full truncate text-sm font-bold leading-tight text-foreground">
        {fighter.lastName}
      </span>
    </div>
  );

  return side === 'left' ? (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
      {names}
      {headshot}
    </div>
  ) : (
    <div className="flex min-w-0 flex-1 items-center justify-start gap-2">
      {headshot}
      {names}
    </div>
  );
}

export function UpcomingFightCard({ fight }: UpcomingFightCardProps) {
  const hypeScore = fight.averageHype ?? 0;
  const userHype = fight.userHypeScore ?? 0;
  const hasHype = hypeScore > 0;
  const hasUserHype = userHype > 0;

  const hypeColor = hasHype ? getHypeHeatmapColor(hypeScore) : undefined;
  const userHypeColor = hasUserHype ? getHypeHeatmapColor(userHype) : undefined;

  return (
    <Link href={`/fights/${fight.id}`} className="block">
      <div className="group flex min-h-[64px] items-stretch transition-colors hover:bg-background/40">
        {/* Left: community hype square */}
        <div
          className="flex w-12 shrink-0 flex-col items-center justify-center gap-0.5"
          style={{
            backgroundColor: hasHype ? hypeColor : 'transparent',
            border: hasHype ? 'none' : '1px solid var(--color-border, #2a2a2a)',
          }}
        >
          {hasHype ? (
            <>
              <span className="text-base font-bold leading-none text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_60%)]">
                {hypeScore === 10 ? '10' : hypeScore.toFixed(1)}
              </span>
              {fight.totalHypePredictions ? (
                <span className="text-[9px] font-semibold leading-none text-black/55">
                  ({fight.totalHypePredictions})
                </span>
              ) : (
                <Flame size={11} className="text-black/40" />
              )}
            </>
          ) : (
            <Flame size={16} className="text-text-secondary/50" />
          )}
        </div>

        {/* Center: fighters */}
        <div className="flex min-w-0 flex-1 items-center px-2 py-2">
          <FighterSide fighter={fight.fighter1} side="left" />
          <div className="px-2 text-[10px] font-semibold tracking-wider text-text-secondary">
            vs
          </div>
          <FighterSide fighter={fight.fighter2} side="right" />
        </div>

        {/* Right: user hype flame */}
        <div className="relative flex w-12 shrink-0 items-center justify-center">
          {hasUserHype ? (
            <>
              <Flame
                size={42}
                fill={userHypeColor}
                color={userHypeColor}
                strokeWidth={1.5}
              />
              <span className="absolute inset-0 flex items-center justify-center pt-1.5 text-base font-bold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_70%)]">
                {Math.round(userHype)}
              </span>
            </>
          ) : (
            <Flame size={30} className="text-text-secondary/30" />
          )}
        </div>
      </div>
    </Link>
  );
}
