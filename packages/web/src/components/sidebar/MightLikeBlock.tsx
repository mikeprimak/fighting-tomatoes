'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getUpcomingRecommendedFights, type RecommendedFight } from '@/lib/api';
import { Telescope } from 'lucide-react';

const ROTATE_MS = 10_000;

function fighterLast(f: RecommendedFight['fighter1']): string {
  return f.lastName || f.firstName || '';
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MightLikeBlock() {
  const { user, isAuthenticated } = useAuth();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const { data } = useQuery({
    queryKey: ['upcomingRecommended', user?.id ?? null],
    queryFn: () => getUpcomingRecommendedFights(10),
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
  });

  const fights = data?.fights ?? [];

  // Rotate the visible fight every ROTATE_MS. Brief fade between picks so the
  // change registers without being jarring.
  useEffect(() => {
    if (fights.length <= 1) return;
    const tick = setInterval(() => {
      setVisible(false);
      const fadeTimer = setTimeout(() => {
        setIndex(i => (i + 1) % fights.length);
        setVisible(true);
      }, 250);
      // Stash so cleanup below can clear it if the component unmounts mid-fade.
      (tick as any)._fadeTimer = fadeTimer;
    }, ROTATE_MS);
    return () => {
      clearInterval(tick);
      const fade = (tick as any)._fadeTimer;
      if (fade) clearTimeout(fade);
    };
  }, [fights.length]);

  if (!isAuthenticated) return null;
  if (fights.length === 0) return null;

  const f = fights[Math.min(index, fights.length - 1)];
  const promotion = (f.event as any)?.promotion as string | undefined;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <Telescope size={11} className="text-primary" />
        Upcoming fight you might like
      </h3>

      <Link
        href={`/fights/${f.id}`}
        className="block group transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
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
