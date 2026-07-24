'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Flame, Star, Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getTasteProfile } from '@/lib/api';

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

  // Rotating identity noun + top insight from the taste engine (2026-07-04
  // revamp; the frozen personalityType label is shelved). max 4 + daily salt
  // match the other surfaces so the noun agrees everywhere today.
  const todaySalt = new Date().toISOString().slice(0, 10);
  const { data: taste } = useQuery({
    queryKey: ['tasteProfile', 'identity', user?.id ?? null, todaySalt],
    queryFn: () => getTasteProfile({ max: 4, salt: todaySalt }),
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
        <Image
          src="/good-fights-full-vertical.png"
          alt="Good Fights"
          width={240}
          height={268}
          className="mx-auto mb-3 h-auto w-full"
          priority
        />
        <p className="mb-4 text-lg font-bold text-foreground">
          Never miss a Good Fight.
        </p>
        <ul className="mb-4 space-y-3 text-left">
          <li className="flex items-start gap-2.5 text-base leading-snug text-text-secondary md:text-sm">
            <Flame size={18} className="mt-0.5 shrink-0 text-text-secondary" />
            <span>See which upcoming fights are hyped</span>
          </li>
          <li className="flex items-start gap-2.5 text-base leading-snug text-text-secondary md:text-sm">
            <Star size={18} className="mt-0.5 shrink-0 text-text-secondary" />
            <span>See which fights entertained</span>
          </li>
          <li className="flex items-start gap-2.5 text-base leading-snug text-text-secondary md:text-sm">
            <Bell size={18} className="mt-0.5 shrink-0 text-text-secondary" />
            <span>Keep track of fighters and get notified when they fight</span>
          </li>
        </ul>
        <Link
          href="/register"
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-bold text-text-on-accent hover:bg-primary/90"
        >
          Create your account
        </Link>
        <p className="mt-3 text-xs text-text-secondary">
          Already have one?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const displayName = user.displayName || user.email.split('@')[0];
  const initial = displayName[0]?.toUpperCase() ?? '?';
  const identity = taste?.identity ?? null;
  const topInsight = taste?.insights?.[0] ?? null;

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
          {identity ? (
            <p className="mt-0.5 truncate text-xs font-medium text-primary">
              {identity.label}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-text-secondary">
              {formatMemberSince(user.createdAt)}
            </p>
          )}
        </div>
      </Link>

      {/* What the identity means; falls back to the top taste insight. */}
      {identity ? (
        <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
          {identity.explanation}
        </p>
      ) : topInsight ? (
        <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
          <span className="font-semibold text-foreground">{topInsight.headline}.</span>{' '}
          {topInsight.subline}
        </p>
      ) : null}

      {/* Counts row — upvotes = received across both comment types */}
      <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-3">
        <Stat value={user.totalRatings ?? 0} label="Ratings" />
        <Stat value={user.totalHype ?? 0} label="Hype" />
        <Stat value={user.totalReviews ?? 0} label="Comments" />
        <Stat value={user.totalUpvotesReceived ?? 0} label="Upvotes" />
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
