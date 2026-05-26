'use client';

import { useState } from 'react';
import { Flame, MessageCircle, MessageSquareQuote } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { HypeFightModal } from '@/components/HypeFightModal';

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
    hypeCount?: number;
    userHypePrediction?: number;
    commentCount?: number;
    userCommentCount?: number;
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
  const [modalOpen, setModalOpen] = useState(false);

  const hypeScore = fight.averageHype ?? 0;
  const userHype = fight.userHypePrediction ?? 0;
  const hypeCount = fight.hypeCount ?? 0;
  const commentCount = fight.commentCount ?? 0;
  const hasHype = hypeScore > 0;
  const hasUserHype = userHype > 0;
  const hasUserComment = (fight.userCommentCount ?? 0) > 0;

  const hypeColor = hasHype ? getHypeHeatmapColor(hypeScore) : undefined;
  const userHypeColor = hasUserHype ? getHypeHeatmapColor(userHype) : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="block w-full text-left"
      >
      <div className="group relative flex min-h-[72px] items-stretch overflow-visible transition-colors hover:bg-background/40">
        {/* Left: community hype square — matches CompletedFightCard's rating square */}
        <div className="relative w-12 shrink-0">
          <div
            className="absolute left-2 top-3 z-[1] flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md"
            style={{
              backgroundColor: hasHype ? hypeColor : '#202020',
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
                ) : null}
              </>
            ) : (
              <div className="flex flex-col items-center gap-0.5">
                <Flame size={18} className="text-text-secondary/40" />
                {commentCount > 0 ? (
                  <span className="flex items-center gap-0.5 text-[9px] font-semibold leading-none text-text-secondary/70">
                    <MessageCircle size={8} strokeWidth={2.5} />
                    {commentCount}
                  </span>
                ) : null}
              </div>
            )}
          </div>
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
              <span className="absolute inset-0 flex items-center justify-center pt-1 text-base font-bold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_70%)]">
                {Math.round(userHype)}
              </span>
            </>
          ) : (
            <Flame size={30} className="text-text-secondary/30" />
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
      </button>
      <HypeFightModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        fight={fight}
        existingHype={userHype || undefined}
      />
    </>
  );
}
