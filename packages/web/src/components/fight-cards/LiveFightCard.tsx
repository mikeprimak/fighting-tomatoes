'use client';

import { useState } from 'react';
import { MessageCircle, MessageSquareQuote, Star } from 'lucide-react';
import { FighterAvatar } from '@/components/FighterAvatar';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { formatWeightClass } from '@/utils/weightClass';
import { RateFightModal } from '@/components/RateFightModal';
import { FightCardLink } from '@/components/fight-cards/FightCardLink';

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
    slug?: string | null;
    fighter1: Fighter;
    fighter2: Fighter;
    weightClass?: string;
    isTitle: boolean;
    titleName?: string;
    fightStatus: string;
    averageHype?: number;
    hypeCount?: number;
    commentCount?: number;
    averageRating?: number;
    totalRatings?: number;
    reviewCount?: number;
    userHypePrediction?: number;
    userRating?: number;
    userReview?: { content: string; rating?: number };
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
        <FighterAvatar
          src={img}
          alt={`${fighter.firstName} ${fighter.lastName}`}
          initials={placeholder}
          imgClassName="h-full w-full object-cover"
          initialsClassName="flex h-full w-full items-center justify-center text-lg font-bold text-text-secondary"
        />
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
  const stripText = isLive ? 'Live Now' : 'Up Next';
  const [modalOpen, setModalOpen] = useState(false);

  // Mirror CompletedFightCard / the mobile live card: aggregate RATING on the
  // left (front square, with aggregate HYPE peeking behind it), and the user's
  // own RATING on the right — not hype.
  const hypeScore = fight.averageHype ?? 0;
  const hasHype = hypeScore > 0;
  const hypeColor = hasHype ? getHypeHeatmapColor(hypeScore) : undefined;

  const avgRating = fight.averageRating ?? 0;
  const totalRatings = fight.totalRatings ?? 0;
  const reviewCount = fight.reviewCount ?? 0;
  const userRating = fight.userRating ?? 0;
  const hasRating = avgRating > 0;
  const hasUserRating = userRating > 0;
  const hasUserComment = !!fight.userReview?.content?.trim();
  const ratingColor = hasRating ? getHypeHeatmapColor(avgRating) : undefined;
  const userRatingColor = hasUserRating ? getHypeHeatmapColor(userRating) : undefined;

  const userPickedF1 = fight.userPredictedWinner === fight.fighter1.id;
  const userPickedF2 = fight.userPredictedWinner === fight.fighter2.id;

  return (
    <>
      <FightCardLink fight={fight} onOpen={() => setModalOpen(true)}>
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
          {/* Left: aggregate RATING square (front) with aggregate HYPE peeking
              behind it — mirrors CompletedFightCard and the mobile live card. */}
          <div className="relative w-12 shrink-0">
            {/* Hype square (behind, offset down+right) */}
            {hasHype && (
              <div
                className="absolute left-3 top-4 h-12 w-12 rounded-md"
                style={{ backgroundColor: hypeColor, zIndex: 0 }}
              />
            )}
            {/* Rating square (front) — grey (opaque) when not yet rated, so the
                hype square beneath never shows through. */}
            <div
              className="absolute left-2 top-3 z-[1] flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md"
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
              <div className="mt-1 text-[10px] tracking-wider text-text-secondary">
                {formatWeightClass(fight.weightClass)}
              </div>
            )}
          </div>

          {/* Right: user's own RATING star */}
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
            {hasUserComment && (
              <MessageSquareQuote
                size={13}
                className="absolute right-0 top-1 text-[#F5C518]"
                fill="#F5C518"
                aria-label="You commented"
              />
            )}
          </div>
        </div>
      </div>
      </FightCardLink>
      <RateFightModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        fight={fight}
        existingRating={fight.userRating || undefined}
        existingReview={fight.userReview}
      />
    </>
  );
}
