'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getFanDNAProfile, type FanDNACard } from '@/lib/api';
import { Dna, ChevronLeft, LogIn } from 'lucide-react';

const FAMILY_LABELS: Record<string, string> = {
  affinity: 'Affinity',
  behaviour: 'Behaviour',
  prediction: 'Prediction',
  identity: 'Identity',
};

const FAMILY_COLORS: Record<string, string> = {
  affinity: '#A78BFA',
  behaviour: '#60A5FA',
  prediction: '#34D399',
  identity: '#F59E0B',
};

export default function FanDNAPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['fanDNAProfile', user?.id ?? null],
    queryFn: getFanDNAProfile,
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Dna className="text-text-secondary" size={48} />
        <p className="text-text-secondary">Sign in to see your Fan DNA</p>
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-medium text-text-on-accent"
        >
          <LogIn size={16} />
          Sign In
        </Link>
      </div>
    );
  }

  const cards = data?.cards ?? [];
  const personalityType = data?.personalityType ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/profile"
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-foreground"
      >
        <ChevronLeft size={16} />
        Back to profile
      </Link>

      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Dna size={28} style={{ color: FAMILY_COLORS.affinity }} />
        <h1 className="text-2xl font-bold">Your Fan DNA</h1>
        <p className="max-w-md text-sm text-text-secondary">
          Patterns the app has learned from your ratings and hypes.
        </p>
      </div>

      {personalityType && (
        <div
          className="mb-4 rounded-xl border p-5"
          style={{
            backgroundColor: 'rgba(167, 139, 250, 0.18)',
            borderColor: 'rgba(167, 139, 250, 0.45)',
          }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#A78BFA' }}>
            Your Type
          </p>
          <p className="mt-1 text-xl font-extrabold text-foreground">{personalityType.label}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            {personalityType.body}
          </p>
          {personalityType.primaryStat ? (
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold" style={{ color: '#A78BFA' }}>
                {personalityType.primaryStat}
              </span>
              {personalityType.secondaryStat ? (
                <span className="text-xs text-text-secondary">{personalityType.secondaryStat}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-text-secondary">Computing your DNA…</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-center text-sm text-danger">
          Couldn&apos;t load Fan DNA. Please try again.
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="mb-2 text-base font-semibold text-foreground">No DNA yet</p>
          <p className="text-sm text-text-secondary">
            Rate and hype more fights — patterns will surface here as the data builds.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card, i) => (
            <DNACard key={`${card.traitId}-${i}`} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function DNACard({ card }: { card: FanDNACard }) {
  const familyColor = FAMILY_COLORS[card.family] ?? '#888';
  const familyLabel = FAMILY_LABELS[card.family] ?? card.family;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        {card.primaryStat ? (
          <div
            className="flex shrink-0 flex-col items-center justify-center rounded-lg px-3 py-2 text-center"
            style={{ backgroundColor: `${familyColor}22`, minWidth: 64 }}
          >
            <span className="text-lg font-extrabold" style={{ color: familyColor }}>
              {card.primaryStat}
            </span>
            {card.secondaryStat ? (
              <span className="mt-0.5 text-[10px] text-text-secondary">{card.secondaryStat}</span>
            ) : null}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{card.headline}</p>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: `${familyColor}33`, color: familyColor }}
            >
              {familyLabel}
            </span>
          </div>
          {card.body ? (
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">{card.body}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
