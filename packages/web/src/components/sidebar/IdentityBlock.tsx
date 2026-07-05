'use client';

import Link from 'next/link';
import Image from 'next/image';
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
        <p className="mb-3 text-sm font-bold text-foreground">
          Never miss a Good Fight.
        </p>
        <p className="mb-3 text-xs leading-relaxed text-text-secondary">
          Your home for combat sports across 15+ promotions — UFC, boxing, and
          more in one place.
        </p>
        <ul className="mb-4 space-y-2 text-left">
          <li className="flex gap-2 text-xs leading-snug text-text-secondary">
            <span aria-hidden className="text-primary">🔥</span>
            <span>
              <span className="font-semibold text-foreground">See the hype.</span>{' '}
              Know which fights are worth watching before they happen.
            </span>
          </li>
          <li className="flex gap-2 text-xs leading-snug text-text-secondary">
            <span aria-hidden className="text-primary">⭐</span>
            <span>
              <span className="font-semibold text-foreground">Rate every fight.</span>{' '}
              Find the bouts the community loved and skip the duds.
            </span>
          </li>
          <li className="flex gap-2 text-xs leading-snug text-text-secondary">
            <span aria-hidden className="text-primary">🧬</span>
            <span>
              <span className="font-semibold text-foreground">Build your Fan DNA.</span>{' '}
              A profile that shows what kind of fight fan you are.
            </span>
          </li>
          <li className="flex gap-2 text-xs leading-snug text-text-secondary">
            <span aria-hidden className="text-primary">🔔</span>
            <span>
              <span className="font-semibold text-foreground">Follow fighters.</span>{' '}
              Get notified on the app the moment they&apos;re booked.
            </span>
          </li>
        </ul>
        <Link
          href="/register"
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-bold text-text-on-accent hover:bg-primary/90"
        >
          Create your account
        </Link>
        <p className="mt-3 text-xs text-text-secondary">
          Already a fan?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  const displayName = user.displayName || user.email.split('@')[0];
  const initial = displayName[0]?.toUpperCase() ?? '?';
  const identityLabel = taste?.identityLabel ?? null;
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
          {identityLabel ? (
            <p className="mt-0.5 truncate text-xs font-medium text-primary">
              {identityLabel}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-text-secondary">
              {formatMemberSince(user.createdAt)}
            </p>
          )}
        </div>
      </Link>

      {/* Top taste insight (if the engine has one) */}
      {topInsight ? (
        <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
          <span className="font-semibold text-foreground">{topInsight.headline}.</span>{' '}
          {topInsight.subline}
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
