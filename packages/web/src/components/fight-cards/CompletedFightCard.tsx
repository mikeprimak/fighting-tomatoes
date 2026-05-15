'use client';

import Link from 'next/link';
import { Star, MessageCircle } from 'lucide-react';
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
    reviewCount?: number;
    averageHype?: number;
    userRating?: number;
    userPredictedWinner?: string | null;
    fightStatus: string;
  };
  showRank?: number;
}

function formatMethod(method: string | null | undefined) {
  if (!method) return '';
  const upper = method.toUpperCase();
  if (upper === 'KO_TKO' || upper === 'KO/TKO' || upper === 'KO' || upper === 'TKO') return 'KO';
  if (upper === 'DECISION' || upper.startsWith('DECISION')) return 'DEC';
  if (upper === 'SUBMISSION') return 'SUB';
  return method;
}

function FighterBlock({
  fighter,
  side,
  isWinner,
  hideSpoilers,
  method,
  round,
  userPicked,
}: {
  fighter: Fighter;
  side: 'left' | 'right';
  isWinner: boolean;
  hideSpoilers: boolean;
  method?: string;
  round?: number;
  userPicked: boolean;
}) {
  const img = fighter.profileImage || '';
  const placeholder = `${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`.toUpperCase();
  const showWinnerRing = !hideSpoilers && isWinner;
  const showLoserDim = !hideSpoilers && !isWinner && !!fighter.id && method;

  const headshot = (
    <div className="relative shrink-0">
      <div
        className={`h-14 w-14 overflow-hidden rounded-full ${
          showWinnerRing ? 'ring-2 ring-[#166534]' : 'bg-card'
        }`}
      >
        {img ? (
          <img
            src={img}
            alt={`${fighter.firstName} ${fighter.lastName}`}
            className={`h-full w-full object-cover ${showLoserDim ? 'opacity-60' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary">
            {placeholder}
          </div>
        )}
      </div>
      {!hideSpoilers && userPicked && (
        <div
          className={`absolute -bottom-1 h-5 w-5 rounded-full ${
            side === 'left' ? '-left-1' : '-right-1'
          } flex items-center justify-center text-[10px] font-bold text-white`}
          style={{ backgroundColor: isWinner ? '#166534' : '#991B1B' }}
        >
          {isWinner ? '✓' : '✕'}
        </div>
      )}
    </div>
  );

  const names = (
    <div className={`flex min-w-0 flex-1 flex-col ${side === 'left' ? 'items-end text-right' : 'items-start text-left'}`}>
      <span className="max-w-full truncate text-[11px] font-normal leading-tight text-text-secondary">
        {fighter.firstName}
      </span>
      <span
        className={`max-w-full truncate text-sm font-bold leading-tight ${
          showWinnerRing ? 'text-foreground' : 'text-foreground'
        }`}
      >
        {fighter.lastName}
      </span>
      {showWinnerRing && method && (
        <span className="mt-0.5 truncate text-[10px] font-semibold leading-none text-success">
          {formatMethod(method)}
          {round && !method?.toLowerCase().includes('decision') ? ` R${round}` : ''}
        </span>
      )}
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

export function CompletedFightCard({ fight, showRank }: CompletedFightCardProps) {
  const { spoilerFreeMode } = useSpoilerFree();
  const hideSpoilers = spoilerFreeMode && !fight.userRating;

  const avgRating = fight.averageRating ?? 0;
  const totalRatings = fight.totalRatings ?? 0;
  const reviewCount = fight.reviewCount ?? 0;
  const avgHype = fight.averageHype ?? 0;
  const userRating = fight.userRating ?? 0;

  const hasRating = avgRating > 0;
  const hasHype = avgHype > 0;
  const hasUserRating = userRating > 0;

  const ratingColor = hasRating ? getHypeHeatmapColor(avgRating) : undefined;
  const hypeColor = hasHype ? getHypeHeatmapColor(avgHype) : undefined;
  const userRatingColor = hasUserRating ? getHypeHeatmapColor(userRating) : undefined;

  const isWinner1 = fight.winner === fight.fighter1.id;
  const isWinner2 = fight.winner === fight.fighter2.id;
  const isNoContest = fight.winner === 'nc';
  const isDraw = fight.winner === 'draw';

  const userPickedF1 = fight.userPredictedWinner === fight.fighter1.id;
  const userPickedF2 = fight.userPredictedWinner === fight.fighter2.id;

  return (
    <Link href={`/fights/${fight.id}`} className="block">
      <div className="group relative flex min-h-[72px] items-stretch overflow-visible transition-colors hover:bg-background/40">
        {/* Left: hype square offset behind rating square */}
        <div className="relative w-12 shrink-0">
          {/* Hype square (behind, offset down+right) */}
          {hasHype && (
            <div
              className="absolute left-1 top-1 h-12 w-12 rounded-md"
              style={{ backgroundColor: hypeColor, zIndex: 0 }}
            />
          )}
          {/* Rating square (front) */}
          <div
            className="absolute left-0 top-0 z-[1] flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md"
            style={{
              backgroundColor: hasRating ? ratingColor : '#202020',
              border: hasRating ? 'none' : '1px solid var(--color-border, #2a2a2a)',
            }}
          >
            {hasRating ? (
              <>
                <span className="text-base font-bold leading-none text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_60%)]">
                  {avgRating === 10 ? '10' : avgRating.toFixed(1)}
                </span>
                {(totalRatings > 0 || reviewCount > 0) ? (
                  <div className="flex items-center gap-1 text-[9px] font-semibold leading-none text-black/60">
                    {totalRatings > 0 ? <span>({totalRatings})</span> : null}
                    {reviewCount > 0 ? (
                      <span className="flex items-center gap-0.5">
                        <MessageCircle size={8} strokeWidth={2.5} />
                        {reviewCount}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col items-center gap-0.5">
                <Star size={18} className="text-text-secondary/40" />
                {reviewCount > 0 ? (
                  <span className="flex items-center gap-0.5 text-[9px] font-semibold leading-none text-text-secondary/70">
                    <MessageCircle size={8} strokeWidth={2.5} />
                    {reviewCount}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Center: fighters + names */}
        <div className="relative flex min-w-0 flex-1 items-center px-2 py-2">
          <FighterBlock
            fighter={fight.fighter1}
            side="left"
            isWinner={isWinner1}
            hideSpoilers={hideSpoilers}
            method={isWinner1 ? fight.method : undefined}
            round={isWinner1 ? fight.round : undefined}
            userPicked={userPickedF1}
          />
          <div className="flex flex-col items-center px-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">vs</span>
            {showRank ? (
              <span className="mt-0.5 text-[10px] font-bold text-primary">#{showRank}</span>
            ) : null}
          </div>
          <FighterBlock
            fighter={fight.fighter2}
            side="right"
            isWinner={isWinner2}
            hideSpoilers={hideSpoilers}
            method={isWinner2 ? fight.method : undefined}
            round={isWinner2 ? fight.round : undefined}
            userPicked={userPickedF2}
          />

          {/* NC / DRAW centered badge */}
          {!hideSpoilers && (isNoContest || isDraw) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0.5 flex justify-center">
              <span
                className="text-[10px] font-semibold"
                style={{ color: isNoContest ? '#3B82F6' : '#F59E0B' }}
              >
                {isNoContest ? 'NO CONTEST' : 'DRAW'}
                {fight.round ? ` R${fight.round}` : ''}
              </span>
            </div>
          )}

          {hideSpoilers && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0.5 flex justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                Result hidden
              </span>
            </div>
          )}
        </div>

        {/* Right: user-rating star */}
        <div className="relative flex w-12 shrink-0 items-center justify-center">
          {hasUserRating ? (
            <>
              <Star
                size={42}
                fill={userRatingColor}
                color={userRatingColor}
                strokeWidth={1.5}
              />
              <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_70%)]">
                {Math.round(userRating)}
              </span>
            </>
          ) : (
            <Star size={30} className="text-text-secondary/30" />
          )}
        </div>
      </div>
    </Link>
  );
}
