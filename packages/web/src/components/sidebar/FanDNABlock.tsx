'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getFanDNAProfile, type FanDNACard } from '@/lib/api';
import { Dna, ChevronRight } from 'lucide-react';

const FAMILY_COLORS: Record<string, string> = {
  affinity: '#F87171',
  behaviour: '#60A5FA',
  prediction: '#34D399',
  identity: '#F59E0B',
};

export function FanDNABlock() {
  const { user, isAuthenticated } = useAuth();

  const { data } = useQuery({
    queryKey: ['fanDNAProfile', user?.id ?? null],
    queryFn: getFanDNAProfile,
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAuthenticated) return null;
  const cards = data?.cards ?? [];
  if (cards.length === 0) return null;

  // Cards arrive sorted by weight desc from the backend; show the top 4.
  const top = cards.slice(0, 4);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          <Dna size={11} style={{ color: FAMILY_COLORS.affinity }} />
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
        {top.map((card, i) => (
          <li key={`${card.traitId}-${i}`}>
            <DNARow card={card} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DNARow({ card }: { card: FanDNACard }) {
  const familyColor = FAMILY_COLORS[card.family] ?? '#888';
  return (
    <div className="flex items-start gap-2">
      {card.primaryStat ? (
        <div
          className="flex shrink-0 flex-col items-center justify-center rounded px-1.5 py-1 text-center"
          style={{ backgroundColor: `${familyColor}22`, minWidth: 40 }}
        >
          <span
            className="text-[11px] font-bold leading-tight tabular-nums"
            style={{ color: familyColor }}
          >
            {card.primaryStat}
          </span>
          {card.secondaryStat ? (
            <span className="mt-0.5 text-[9px] leading-tight text-text-secondary">
              {card.secondaryStat}
            </span>
          ) : null}
        </div>
      ) : (
        <span
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: familyColor }}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{card.headline}</p>
        {card.body ? (
          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{card.body}</p>
        ) : null}
      </div>
    </div>
  );
}
