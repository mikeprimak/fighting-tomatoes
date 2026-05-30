'use client';

import type { ReactNode } from 'react';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { LiveFightCard } from '@/components/fight-cards/LiveFightCard';

type Mode = 'upcoming' | 'past' | 'live';

interface FightSectionListProps {
  fights: any[];
  mode: Mode;
  upNextFightId?: string;
}

// Column-header row that sits above the fight cards, labelling the two number
// columns each card shows: the community aggregate (left square) and the user's
// own value (right flame/star). Mirrors the mobile app's HYPE / MY HYPE and
// RATING / MY RATING headers. Geometry matches the cards' left/right w-12
// columns so the labels sit over the squares they describe.
function FightColumnHeader({ variant }: { variant: 'hype' | 'rating' }) {
  const left = variant === 'hype' ? 'Hype' : 'Rating';
  const right = variant === 'hype' ? 'My Hype' : 'My Rating';
  return (
    <div className="flex items-stretch py-1">
      <div className="flex w-12 shrink-0 items-center justify-center pl-2">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-text-secondary">
          {left}
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex w-12 shrink-0 items-center justify-center">
        <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-text-secondary">
          {right}
        </span>
      </div>
    </div>
  );
}

// A fight shows hype (upcoming/live) or rating (completed). A whole past event
// is all-rating regardless of per-fight status.
function variantOf(fight: any, mode: Mode): 'hype' | 'rating' {
  return mode === 'past' || fight.fightStatus === 'COMPLETED' ? 'rating' : 'hype';
}

export function FightSectionList({ fights, mode, upNextFightId }: FightSectionListProps) {
  const nodes: ReactNode[] = [];
  let prevVariant: 'hype' | 'rating' | null = null;

  // Preserve the incoming fight order; insert a column header whenever the
  // variant changes (so a mixed live section gets a Hype header over its
  // upcoming/live block and a Rating header over its completed block).
  for (const fight of fights) {
    const variant = variantOf(fight, mode);
    if (variant !== prevVariant) {
      nodes.push(<FightColumnHeader key={`hdr-${fight.id}`} variant={variant} />);
      prevVariant = variant;
    }

    if (mode === 'past' || fight.fightStatus === 'COMPLETED') {
      nodes.push(<CompletedFightCard key={fight.id} fight={fight} />);
      continue;
    }
    if (mode === 'live') {
      const isLiveNow = fight.fightStatus === 'LIVE';
      const isUpNext = upNextFightId === fight.id;
      if (isLiveNow || isUpNext) {
        nodes.push(
          <LiveFightCard key={fight.id} fight={fight} isLiveNow={isLiveNow} isUpNext={isUpNext} />,
        );
        continue;
      }
      nodes.push(<UpcomingFightCard key={fight.id} fight={fight} />);
      continue;
    }
    nodes.push(<UpcomingFightCard key={fight.id} fight={fight} />);
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {nodes}
    </div>
  );
}
