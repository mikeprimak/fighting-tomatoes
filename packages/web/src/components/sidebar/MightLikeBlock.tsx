'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getUpcomingRecommendedFights, type RecommendedFight } from '@/lib/api';
import { Telescope } from 'lucide-react';

function fighterLast(f: RecommendedFight['fighter1']): string {
  return f.lastName || f.firstName || '';
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Daily rotation seed — hash(userId + day-of-year) % count.
// Stable per day, changes overnight, varies between users.
function pickIndex(seed: string, count: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % count;
}

function dayKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
}

export function MightLikeBlock() {
  const { user, isAuthenticated } = useAuth();

  // Fetch a small pool so the daily rotation has room to vary. Backend
  // returns by relevance — any of these is a fair "you might like" pick.
  const { data } = useQuery({
    queryKey: ['upcomingRecommended', user?.id ?? null],
    queryFn: () => getUpcomingRecommendedFights(5),
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
  });

  if (!isAuthenticated) return null;
  const fights = data?.fights ?? [];
  if (fights.length === 0) return null;

  const idx = pickIndex(`${user?.id ?? 'anon'}-${dayKey()}`, fights.length);
  const f = fights[idx];
  const promotion = (f.event as any)?.promotion as string | undefined;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <Telescope size={11} className="text-primary" />
        Upcoming fight you might like
      </h3>

      <Link href={`/fights/${f.id}`} className="block group">
        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
          {fighterLast(f.fighter1)} vs {fighterLast(f.fighter2)}
        </p>
        <p className="mt-1 truncate text-[11px] text-text-secondary">
          {shortDate(f.event.date)}
          {promotion ? ` · Event: ${promotion}` : ''}
          {f.event.name ? ` · ${f.event.name}` : ''}
        </p>
        {f.reason ? (
          <p className="mt-1.5 text-[11px] leading-snug text-text-secondary/80 italic">
            {f.reason}
          </p>
        ) : null}
      </Link>
    </div>
  );
}
