'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ArrowRight } from 'lucide-react';
import { getHighlightedFighter } from '@/lib/api';
import { FighterAvatar } from '@/components/FighterAvatar';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { SectionHeading } from './SectionHeading';

function record(f: { wins?: number; losses?: number; draws?: number }) {
  const w = f.wins ?? 0, l = f.losses ?? 0, d = f.draws ?? 0;
  if (w + l + d === 0) return '';
  return d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
}

function fighterLast(
  f: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  if (!f) return '';
  return f.lastName || f.firstName || '';
}

/**
 * Highlighted Fighter: a daily-rotating AI-enriched fighter shown big — a large
 * portrait, the AI bio summary, and their top-rated fight. The headline links
 * through to the full fighter profile.
 */
export function HighlightedFighterSection() {
  const { data } = useQuery({
    queryKey: ['home', 'highlighted-fighter'],
    queryFn: getHighlightedFighter,
    staleTime: 30 * 60 * 1000,
  });

  const highlight = data?.data;
  if (!highlight?.fighter) return null;

  const { fighter, topFight } = highlight;
  const name = `${fighter.firstName} ${fighter.lastName}`.trim();
  const img = fighter.actionImage || fighter.profileImage || '';
  const initials = `${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`.toUpperCase();
  const rec = record(fighter);
  const summary = fighter.aiProfile?.tldr || fighter.aiProfileSummary || '';

  return (
    <section className="mb-8">
      <SectionHeading title="Highlighted Fighter" icon={Sparkles} />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="sm:flex">
          {/* Portrait */}
          <Link
            href={`/fighters/${fighter.id}`}
            className="relative block aspect-[4/5] w-full shrink-0 overflow-hidden bg-background-secondary sm:aspect-auto sm:w-2/5"
          >
            <FighterAvatar
              src={img}
              alt={name}
              initials={initials}
              imgClassName="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
              initialsClassName="flex h-full w-full items-center justify-center text-4xl font-bold text-text-secondary"
            />
          </Link>

          {/* Bio + top fight */}
          <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
            <Link href={`/fighters/${fighter.id}`} className="group">
              {fighter.nickname && (
                <span className="text-sm font-medium text-text-secondary">
                  &ldquo;{fighter.nickname}&rdquo;
                </span>
              )}
              <h3 className="text-2xl font-bold leading-tight text-foreground group-hover:text-primary">
                {name}
              </h3>
            </Link>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
              {rec && <span className="font-semibold text-foreground">{rec}</span>}
              {fighter.weightClass && <span>{fighter.weightClass}</span>}
            </div>

            {summary && (
              <p className="mt-3 line-clamp-5 text-sm leading-relaxed text-text-secondary">
                {summary}
              </p>
            )}

            <Link
              href={`/fighters/${fighter.id}`}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              Full profile
              <ArrowRight size={15} />
            </Link>

            {topFight && (
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  Top-rated fight
                </p>
                {/* Simple text + rating (mirrors the mobile spotlight style) —
                    the full fight card was too cramped in this narrow column. */}
                <Link
                  href={`/fights/${topFight.id}`}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                      {fighterLast(topFight.fighter1)} vs {fighterLast(topFight.fighter2)}
                    </p>
                    {topFight.event?.name && (
                      <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                        {topFight.event.name}
                      </p>
                    )}
                  </div>
                  {(topFight.averageRating ?? 0) > 0 && (
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: getHypeHeatmapColor(topFight.averageRating ?? 0) }}
                    >
                      <span className="text-sm font-bold leading-none text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_60%)]">
                        {(topFight.averageRating ?? 0) === 10 ? '10' : (topFight.averageRating ?? 0).toFixed(1)}
                      </span>
                    </div>
                  )}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
