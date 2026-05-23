'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getFanDNAProfile, type FanDNACard } from '@/lib/api';
import { Dna, ChevronRight } from 'lucide-react';

const FAMILY_COLORS: Record<string, string> = {
  affinity: '#A78BFA',
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

  // Cards arrive sorted by weight desc from the backend; show the top 3.
  const top = cards.slice(0, 3);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        <Dna size={11} style={{ color: FAMILY_COLORS.affinity }} />
        Fan DNA
      </h3>

      <ul className="space-y-2.5">
        {top.map((card, i) => (
          <li key={`${card.traitId}-${i}`}>
            <DNARow card={card} />
          </li>
        ))}
      </ul>

      <Link
        href="/fan-dna"
        className="mt-3 flex items-center justify-center gap-0.5 rounded border border-border py-1.5 text-[11px] font-medium text-text-secondary hover:border-primary/30 hover:text-primary"
      >
        See full DNA
        <ChevronRight size={12} />
      </Link>
    </div>
  );
}

function DNARow({ card }: { card: FanDNACard }) {
  const familyColor = FAMILY_COLORS[card.family] ?? '#888';
  return (
    <div className="flex items-center gap-2">
      {card.primaryStat ? (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
          style={{ backgroundColor: `${familyColor}22`, color: familyColor }}
        >
          {card.primaryStat}
        </span>
      ) : (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: familyColor }}
        />
      )}
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {card.headline}
      </p>
    </div>
  );
}
