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

export function MightLikeBlock() {
  const { user, isAuthenticated } = useAuth();

  const { data } = useQuery({
    queryKey: ['upcomingRecommended', user?.id ?? null],
    queryFn: () => getUpcomingRecommendedFights(5),
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
  });

  if (!isAuthenticated) return null;
  const fights = data?.fights ?? [];
  if (fights.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <Telescope size={11} className="text-primary" />
        You might like
      </h3>

      <ul className="space-y-2.5">
        {fights.map((f) => (
          <li key={f.id}>
            <Link href={`/fights/${f.id}`} className="block group">
              <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                {fighterLast(f.fighter1)} vs {fighterLast(f.fighter2)}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                {shortDate(f.event.date)} · {f.event.name}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-text-secondary/80 italic">
                {f.reason}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
