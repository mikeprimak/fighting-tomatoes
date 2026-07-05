'use client';

/**
 * Fan DNA — the full-page mirror (web).
 *
 * Revamped 2026-07-04 onto the taste-profile engine: ranked insights + the
 * rotating identity noun, same data and same daily salt as the mobile
 * screen. The old trait-card list and frozen personalityType card are gone
 * (single-label engine shelved per the locked rotating-signature decision,
 * identity-platform.md 2026-06-09).
 *
 * Voice per Good_Fights_Voice_Guide: header is the friend talking; the
 * plumbing (loading, error, empty) stays plain. Silence > filler.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getTasteProfile } from '@/lib/api';
import { Dna, LogIn } from 'lucide-react';

const MAX_INSIGHTS = 12;

export default function FanDNAPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Same day-salt as mobile so both surfaces say the same thing today.
  const todaySalt = new Date().toISOString().slice(0, 10);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tasteProfile', 'fullScreen', user?.id ?? null, todaySalt],
    queryFn: () => getTasteProfile({ max: MAX_INSIGHTS, salt: todaySalt }),
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

  const insights = data?.insights ?? [];
  const identityLabel = data?.identityLabel ?? null;
  const ratedCount = data?.baseline?.count ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-text-secondary">Reading your ratings…</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-center text-sm text-danger">
          Couldn&apos;t load Fan DNA. Please try again.
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="mb-2 text-base font-semibold text-foreground">
            Nothing to read yet
          </p>
          <p className="text-sm text-text-secondary">
            Rate some fights. The patterns show up on their own.
          </p>
        </div>
      ) : (
        <>
          {/* Hero: rotating identity noun. No noun = no hero line. */}
          <div className="mb-6">
            {identityLabel ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
                  This week you&apos;re a
                </p>
                <h1 className="mt-1 text-3xl font-extrabold text-primary">
                  {identityLabel}
                </h1>
              </>
            ) : (
              <h1 className="text-2xl font-bold text-foreground">Your Fan DNA</h1>
            )}
            <p className="mt-2 text-sm text-text-secondary">
              Here&apos;s what your ratings gave away.
            </p>
          </div>

          <div className="space-y-3">
            {insights.map((insight) => (
              <div
                key={insight.key}
                className="rounded-lg border border-border border-l-[3px] border-l-primary bg-card p-4"
              >
                <p className="text-base font-bold leading-snug text-foreground">
                  {insight.headline}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                  {insight.subline}
                </p>
              </div>
            ))}
          </div>

          {ratedCount > 0 ? (
            <p className="mt-6 text-center text-xs text-text-secondary">
              {ratedCount.toLocaleString()} {ratedCount === 1 ? 'fight' : 'fights'} rated
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
