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

/** Promotion label for display — strip underscores (e.g. "TOP_RANK"). */
function promotionLabel(promotion: string | null | undefined): string {
  return (promotion ?? '').replace(/_/g, ' ');
}

/** "in 2 days" / "tomorrow" / "in 2 weeks" — relative time to an event, by
 *  calendar day so it doesn't drift with the hour of day. */
function relativeEventTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startEvent = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startEvent.getTime() - startToday.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return `in ${weeks} week${weeks === 1 ? '' : 's'}`;
}

/** Group a flat, hype-sorted fight list by event, preserving first-appearance
 *  order so the soonest/most-hyped event leads. */
function groupByEvent(fights: any[]): { event: any; fights: any[] }[] {
  const groups: { event: any; fights: any[] }[] = [];
  const byId = new Map<string, { event: any; fights: any[] }>();
  for (const f of fights) {
    const id = f.event?.id ?? 'unknown';
    let g = byId.get(id);
    if (!g) {
      g = { event: f.event, fights: [] };
      byId.set(id, g);
      groups.push(g);
    }
    g.fights.push(f);
  }
  return groups;
}

/** Hyped Upcoming Fights: the most-hyped upcoming bouts (avg hype ≥ 7). */
export function HotUpcomingFightsSection() {
  const { data } = useQuery({
    queryKey: ['home', 'hot-upcoming'],
    queryFn: () => getTopUpcomingFights('week'),
    staleTime: 5 * 60 * 1000,
  });

  const fights = (data?.data ?? []).slice(0, MAX);
  if (fights.length === 0) return null;

  const groups = groupByEvent(fights);

  return (
    <section className="mb-8">
      <SectionHeading title="Hyped Upcoming Fights" icon={Flame} href="/events/upcoming" />
      <div className="space-y-4">
        {groups.map((g, i) => (
          <div key={g.event?.id ?? i}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {promotionLabel(g.event?.promotion) || 'Event'}{' '}
              {relativeEventTime(g.event?.mainStartTime ?? g.event?.date)}
            </h3>
            <FightCardList>
              {g.fights.map((fight: any) => (
                <UpcomingFightCard key={fight.id} fight={fight} />
              ))}
            </FightCardList>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Recent Good Fights: the highest community-rated bouts from the last 2 weeks. */
export function RecentGoodFightsSection() {
  const { data } = useQuery({
    queryKey: ['home', 'recent-good'],
    queryFn: () => getTopRecentFights('2weeks', undefined, 1, MAX),
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
      <SectionHeading title="Classic Good Fights" icon={History} href="/fights/top?period=all" />
      <FightCardList>
        {fights.map((fight: any) => (
          <CompletedFightCard key={fight.id} fight={fight} showEvent />
        ))}
      </FightCardList>
    </section>
  );
}
