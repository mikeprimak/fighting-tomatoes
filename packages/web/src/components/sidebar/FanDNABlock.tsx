'use client';

/**
 * Sidebar Fan DNA teaser — top taste-profile insights (2026-07-04 revamp;
 * trait cards replaced by the taste engine, same daily salt as the full
 * page so the sidebar and the page agree). Renders nothing without
 * insights: silence > filler.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getTasteProfile } from '@/lib/api';
import { Dna, ChevronRight } from 'lucide-react';

const SHOW_COUNT = 3;

export function FanDNABlock() {
  const { user, isAuthenticated } = useAuth();

  const todaySalt = new Date().toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ['tasteProfile', 'sidebar', user?.id ?? null, todaySalt],
    queryFn: () => getTasteProfile({ max: SHOW_COUNT, salt: todaySalt }),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAuthenticated) return null;
  const insights = (data?.insights ?? []).slice(0, SHOW_COUNT);
  if (insights.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          <Dna size={11} className="text-primary" />
          Your Fan DNA
        </h3>
        <Link
          href="/fan-dna"
          className="flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-text-secondary hover:text-primary"
        >
          See full DNA
          <ChevronRight size={12} />
        </Link>
      </div>

      <ul className="space-y-3">
        {insights.map((insight) => (
          <li key={insight.key} className="border-l-2 border-primary pl-2.5">
            <p className="text-xs font-semibold text-foreground">
              {insight.headline}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">
              {insight.subline}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
