'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { getHighlightedFighter } from '@/lib/api';
import { FighterAvatar } from '@/components/FighterAvatar';
import { SectionHeading } from './SectionHeading';

function record(f: { wins?: number; losses?: number; draws?: number }) {
  const w = f.wins ?? 0, l = f.losses ?? 0, d = f.draws ?? 0;
  if (w + l + d === 0) return '';
  return d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
}

/** Compact portrait card in the Highlighted Fighters rail — portrait, name,
 *  record · weight class, and a short bio. Mirrors the mobile FeaturedFighterCard. */
function FeaturedFighterCard({ fighter }: { fighter: any }) {
  const name = `${fighter.firstName ?? ''} ${fighter.lastName ?? ''}`.trim();
  const initials = `${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`.toUpperCase();
  const rec = record(fighter);
  const meta = [rec, fighter.weightClass].filter(Boolean).join(' · ');
  const summary = fighter.aiProfile?.tldr || fighter.aiProfileSummary || '';

  return (
    <Link
      href={`/fighters/${fighter.id}`}
      className="group w-44 shrink-0 overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="relative h-44 w-full overflow-hidden bg-background-secondary">
        <FighterAvatar
          src={fighter.actionImage || fighter.profileImage}
          alt={name}
          initials={initials}
          imgClassName="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
          initialsClassName="flex h-full w-full items-center justify-center text-2xl font-bold text-text-secondary"
        />
      </div>
      <div className="p-3">
        {fighter.nickname && (
          <p className="truncate text-[11px] font-medium text-text-secondary">
            &ldquo;{fighter.nickname}&rdquo;
          </p>
        )}
        <p className="truncate text-sm font-bold text-foreground group-hover:text-primary">
          {name}
        </p>
        {meta && <p className="mt-0.5 truncate text-[11px] text-text-secondary">{meta}</p>}
        {summary && (
          <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-text-secondary">
            {summary}
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * Highlighted Fighters: a side-scrollable rail of AI-enriched fighters (the
 * server's engagement-ranked, day-rotated pool) — mirrors the mobile home rail.
 * Falls back to the single chosen fighter if the backend predates the
 * `fighters` array.
 */
export function HighlightedFighterSection() {
  const { data } = useQuery({
    queryKey: ['home', 'highlighted-fighter'],
    queryFn: getHighlightedFighter,
    staleTime: 30 * 60 * 1000,
  });

  const fighters =
    data?.fighters && data.fighters.length > 0
      ? data.fighters
      : data?.data?.fighter
        ? [data.data.fighter]
        : [];
  if (fighters.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Highlighted Fighters" icon={Sparkles} />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {fighters.map((f: any) => (
          <FeaturedFighterCard key={f.id} fighter={f} />
        ))}
      </div>
    </section>
  );
}
