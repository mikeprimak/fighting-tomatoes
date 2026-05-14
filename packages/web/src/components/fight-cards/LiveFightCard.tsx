'use client';

import Link from 'next/link';
import { Flame, MessageCircle } from 'lucide-react';
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
    averageHype?: number;
    hypeCount?: number;
    commentCount?: number;
    userHypePrediction?: number;
    userPredictedWinner?: string | null;
  };
  isUpNext?: boolean;
  isLiveNow?: boolean;
}

function FighterImage({ fighter, hasUserPick }: { fighter: Fighter; hasUserPick: boolean }) {
  const img = fighter.profileImage || '';
  const placeholder = `${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <div className="relative">
      <div className="h-20 w-20 overflow-hidden rounded-full bg-card sm:h-[88px] sm:w-[88px]">
        {img ? (
          <img src={img} alt={`${fighter.firstName} ${fighter.lastName}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-text-secondary">
            {placeholder}
          </div>
        )}
      </div>
      {hasUserPick && (
        <div className="absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#F5C518] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
          your pick
        </div>
      )}
    </div>
  );
}

export function LiveFightCard({ fight, isUpNext, isLiveNow }: LiveFightCardProps) {
  const isLive = isLiveNow ?? fight.fightStatus === 'LIVE';
  const stripText = isLive ? 'Live Now' : isUpNext ? 'Up Next' : 'Live Now';

  const hypeScore = fight.averageHype ?? 0;
  const userHype = fight.userHypePrediction ?? 0;
  const hypeCount = fight.hypeCount ?? 0;
  const commentCount = fight.commentCount ?? 0;
  const hasHype = hypeScore > 0;
  const hasUserHype = userHype > 0;

  const hypeColor = hasHype ? getHypeHeatmapColor(hypeScore) : undefined;
  const userHypeColor = hasUserHype ? getHypeHeatmapColor(userHype) : undefined;

  const userPickedF1 = fight.userPredictedWinner === fight.fighter1.id;
  const userPickedF2 = fight.userPredictedWinner === fight.fighter2.id;

  return (
    <Link href={`/fights/${fight.id}`} className="block">
      <div className="group overflow-hidden transition-colors hover:bg-background/40">
        {/* Status strip */}
        <div className="flex items-center justify-center gap-1.5 bg-[#F5C518] py-1.5">
          {isLive && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-danger" />}
          <span className="text-[11px] font-bold uppercase tracking-wider text-black">
            {stripText}
          </span>
          {fight.isTitle && (
            <span className="ml-1 rounded bg-black/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
              {fight.titleName || 'Title'}
            </span>
          )}
        </div>

        {/* Body with gold wash */}
        <div className="relative flex items-stretch bg-[#F5C518]/[0.12]">
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
                {(hypeCount > 0 || commentCount > 0) ? (
                  <div className="flex items-center gap-1 text-[9px] font-semibold leading-none text-black/60">
                    {hypeCount > 0 ? <span>({hypeCount})</span> : null}
                    {commentCount > 0 ? (
                      <span className="flex items-center gap-0.5">
                        <MessageCircle size={8} strokeWidth={2.5} />
                        {commentCount}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <Flame size={11} className="text-black/40" />
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-0.5">
                <Flame size={16} className="text-text-secondary/50" />
                {commentCount > 0 ? (
                  <span className="flex items-center gap-0.5 text-[9px] font-semibold leading-none text-text-secondary/70">
                    <MessageCircle size={8} strokeWidth={2.5} />
                    {commentCount}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Center: fighters + names */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-2 py-3">
            <div className="flex items-center justify-center gap-3 sm:gap-5">
              <FighterImage fighter={fight.fighter1} hasUserPick={userPickedF1} />
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                vs
              </span>
              <FighterImage fighter={fight.fighter2} hasUserPick={userPickedF2} />
            </div>
            <div className="mt-2 grid w-full grid-cols-2 gap-2 text-center">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-normal leading-tight text-text-secondary">
                  {fight.fighter1.firstName}
                </div>
                <div className="truncate text-sm font-bold leading-tight text-foreground">
                  {fight.fighter1.lastName}
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-normal leading-tight text-text-secondary">
                  {fight.fighter2.firstName}
                </div>
                <div className="truncate text-sm font-bold leading-tight text-foreground">
                  {fight.fighter2.lastName}
                </div>
              </div>
            </div>
            {fight.weightClass && (
              <div className="mt-1 text-[10px] uppercase tracking-wider text-text-secondary">
                {fight.weightClass}
              </div>
            )}
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
                <span className="absolute inset-0 flex items-center justify-center pt-1 text-base font-bold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_70%)]">
                  {Math.round(userHype)}
                </span>
              </>
            ) : (
              <Flame size={30} className="text-text-secondary/30" />
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
