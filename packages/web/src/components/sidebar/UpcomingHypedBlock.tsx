'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getUpcomingHypedFights, type UpcomingHypedFight } from '@/lib/api';
import { Flame } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';

function fighterLast(f: UpcomingHypedFight['fighter1']): string {
  return f.lastName || f.firstName || '';
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function UpcomingHypedBlock() {
  const { user, isAuthenticated } = useAuth();

  const { data } = useQuery({
    queryKey: ['upcomingHyped', user?.id ?? null],
    queryFn: () => getUpcomingHypedFights(5, 7),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAuthenticated) return null;
  const fights = data?.fights ?? [];
  if (fights.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <Flame size={11} className="text-primary" />
        Upcoming fights you&apos;re hyped for
      </h3>

      <ul className="space-y-2.5">
        {fights.map((f) => (
          <li key={f.id}>
            <Link href={`/fights/${f.id}`} className="block group">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
                  {fighterLast(f.fighter1)} vs {fighterLast(f.fighter2)}
                </p>
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                  <Flame
                    size={28}
                    fill={getHypeHeatmapColor(f.userHype)}
                    color={getHypeHeatmapColor(f.userHype)}
                    strokeWidth={1.5}
                  />
                  <span className="absolute inset-0 flex translate-y-[3px] items-center justify-center text-[11px] font-bold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_70%)]">
                    {Math.round(f.userHype)}
                  </span>
                </span>
              </div>
              <p className="-mt-[5px] truncate text-[11px] text-text-secondary">
                {shortDate(f.event.date)} · {f.event.name}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
