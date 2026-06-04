'use client';

import { useQuery } from '@tanstack/react-query';
import { Flame, Trophy, History } from 'lucide-react';
import { getTopUpcomingFights, getTopRecentFights, getClassicFights } from '@/lib/api';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { SectionHeading } from './SectionHeading';

const MAX = 6;

/** Bordered, divided list container shared by the fight bands. */
function FightCardList({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {children}
    </div>
  );
}

/** Hot Fights — Upcoming: the most-hyped upcoming bouts (avg hype ≥ 7). */
export function HotUpcomingFightsSection() {
  const { data } = useQuery({
    queryKey: ['home', 'hot-upcoming'],
    queryFn: () => getTopUpcomingFights('week'),
    staleTime: 5 * 60 * 1000,
  });

  const fights = (data?.data ?? []).slice(0, MAX);
  if (fights.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Hot Fights" icon={Flame} href="/events/upcoming" />
      <FightCardList>
        {fights.map((fight: any) => (
          <UpcomingFightCard key={fight.id} fight={fight} />
        ))}
      </FightCardList>
    </section>
  );
}

/** Recent Good Fights: the highest community-rated bouts from the last month. */
export function RecentGoodFightsSection() {
  const { data } = useQuery({
    queryKey: ['home', 'recent-good'],
    queryFn: () => getTopRecentFights('month', undefined, 1, MAX),
    staleTime: 5 * 60 * 1000,
  });

  const fights = (data?.data ?? []).slice(0, MAX);
  if (fights.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Recent Good Fights" icon={Trophy} href="/fights/top" />
      <FightCardList>
        {fights.map((fight: any, i: number) => (
          <CompletedFightCard key={fight.id} fight={fight} showRank={i + 1} showEvent />
        ))}
      </FightCardList>
    </section>
  );
}

/** Classic Good Fights: top-rated bouts 3+ years old — a vault recommendation. */
export function ClassicGoodFightsSection() {
  const { data } = useQuery({
    queryKey: ['home', 'classic-good'],
    queryFn: () => getClassicFights(MAX),
    staleTime: 30 * 60 * 1000,
  });

  const fights = (data?.data ?? []).slice(0, MAX);
  if (fights.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Classic Good Fights" icon={History} />
      <FightCardList>
        {fights.map((fight: any) => (
          <CompletedFightCard key={fight.id} fight={fight} showEvent />
        ))}
      </FightCardList>
    </section>
  );
}
