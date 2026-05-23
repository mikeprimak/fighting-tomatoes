'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getFanDNAProfile } from '@/lib/api';
import { LogIn, User as UserIcon } from 'lucide-react';

function formatMemberSince(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const months =
    (now.getFullYear() - created.getFullYear()) * 12 +
    (now.getMonth() - created.getMonth());
  if (months < 1) return 'Just joined';
  if (months < 12) return `Member ${months} mo`;
  const years = Math.floor(months / 12);
  return `Member ${years} yr${years > 1 ? 's' : ''}`;
}

export function IdentityBlock() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const { data: dna } = useQuery({
    queryKey: ['fanDNAProfile', user?.id ?? null],
    queryFn: getFanDNAProfile,
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="h-16 animate-pulse rounded bg-background-secondary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-center">
        <UserIcon size={28} className="mx-auto mb-2 text-text-secondary" />
        <p className="mb-3 text-sm font-medium text-foreground">
          Sign in to see your taste profile
        </p>
        <p className="mb-4 text-xs text-text-secondary">
          Ratings, hype distribution, Fan DNA, fights you might like.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-text-on-accent hover:bg-primary/90"
        >
          <LogIn size={14} />
          Sign In
        </Link>
      </div>
    );
  }

  const displayName = user.displayName || user.email.split('@')[0];
  const initial = displayName[0]?.toUpperCase() ?? '?';
  const personality = dna?.personalityType ?? null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Top: avatar + name + Fan DNA type */}
      <Link href="/profile" className="flex items-start gap-3 group">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background-secondary text-lg font-bold text-primary">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">
            About you
          </p>
          <p className="truncate text-sm font-bold text-foreground group-hover:text-primary">
            {displayName}
          </p>
          {personality ? (
            <p className="mt-0.5 truncate text-xs font-medium text-primary">
              {personality.label}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-text-secondary">
              {formatMemberSince(user.createdAt)}
            </p>
          )}
        </div>
      </Link>

      {/* Personality body line (if we have one) */}
      {personality?.body ? (
        <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
          {personality.body}
        </p>
      ) : null}

      {/* Counts row */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
        <Stat value={user.totalRatings ?? 0} label="Ratings" />
        <Stat value={user.totalHype ?? 0} label="Hype" />
        <Stat value={user.totalReviews ?? 0} label="Comments" />
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold leading-none text-foreground">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-text-secondary">
        {label}
      </p>
    </div>
  );
}
