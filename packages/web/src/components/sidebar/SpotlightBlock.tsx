'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getMyRatings, getTopRecentFights } from '@/lib/api';
import { Sparkles, Flame, Telescope, Star } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';

// Daily rotation: hash(userId + day-of-year) % variantCount. Stable per day,
// changes overnight, varies between users so a household device doesn't sync up.
function pickVariantIndex(seed: string, count: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % count;
}

function dayKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
}

function fighterLast(f: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!f) return '';
  return f.lastName || f.firstName || '';
}

const VARIANTS = ['past-fight-pick', 'hottest-take', 'taste-callout'] as const;
type VariantId = (typeof VARIANTS)[number];

export function SpotlightBlock() {
  const { user, isAuthenticated } = useAuth();

  // Run both data-bound queries unconditionally so we can fall back when the
  // chosen variant for today turns up empty.
  const { data: topRecent, isFetched: topRecentFetched } = useQuery({
    queryKey: ['topRecentFights', 'month'],
    queryFn: () => getTopRecentFights('month'),
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000,
  });

  const { data: myRatings, isFetched: myRatingsFetched } = useQuery({
    queryKey: ['myRatings', 'sidebar-spotlight'],
    queryFn: () => getMyRatings({ page: '1', limit: '20', filterType: 'ratings', sortBy: 'newest' }),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Hold rendering until both data-bound queries have resolved at least once.
  // Otherwise the always-available taste-callout flashes in and then gets
  // replaced once the network variants load.
  const queriesSettled = topRecentFetched && myRatingsFetched;

  const seed = `${user?.id ?? 'anon'}-${dayKey()}`;
  const chosenIndex = pickVariantIndex(seed, VARIANTS.length);

  // Build each variant's payload; null means "no data, try the next variant".
  const built = useMemo(() => {
    if (!isAuthenticated || !user) return null;

    const ratedFightIds = new Set<string>(
      (myRatings?.fights ?? []).map((f: any) => f.id),
    );

    // Variant: past fight you might love.
    // Pick the highest community-rated fight in the last month the user hasn't rated.
    const pastPick: { type: VariantId; fight: any } | null = (() => {
      const fights = (topRecent?.data ?? [])
        .filter((f: any) => !ratedFightIds.has(f.id))
        .sort((a: any, b: any) => (b.averageRating ?? 0) - (a.averageRating ?? 0));
      const top = fights[0];
      if (!top || (top.averageRating ?? 0) < 7) return null;
      return { type: 'past-fight-pick', fight: top };
    })();

    // Variant: hottest take.
    // Pick the rated fight with the biggest |userRating - communityRating| delta.
    // Requires both fields and at least 5 community ratings to be meaningful.
    const hottest: { type: VariantId; fight: any; delta: number } | null = (() => {
      const candidates = (myRatings?.fights ?? [])
        .filter((f: any) =>
          typeof f.userRating === 'number' &&
          typeof f.averageRating === 'number' &&
          (f.totalRatings ?? 0) >= 5,
        )
        .map((f: any) => ({ fight: f, delta: Math.abs(f.userRating - f.averageRating) }))
        .sort((a: any, b: any) => b.delta - a.delta);
      const top = candidates[0];
      if (!top || top.delta < 1.5) return null;
      return { type: 'hottest-take', fight: top.fight, delta: top.delta };
    })();

    // Variant: taste callout. Always renders if the user has a rating average.
    const avg = typeof user.averageRating === 'number' ? user.averageRating : null;
    const taste: { type: VariantId; avg: number } | null =
      avg !== null && (user.totalRatings ?? 0) >= 5
        ? { type: 'taste-callout', avg }
        : null;

    return { pastPick, hottest, taste };
  }, [isAuthenticated, user, topRecent, myRatings]);

  if (!isAuthenticated || !user || !built) return null;
  if (!queriesSettled) {
    return (
      <div className="rounded-lg border border-primary/30 bg-card p-4">
        <div className="h-16 animate-pulse rounded bg-background-secondary" />
      </div>
    );
  }

  // Pick today's variant, fall through to whatever has data.
  const order: VariantId[] = [
    VARIANTS[chosenIndex],
    ...VARIANTS.filter((v) => v !== VARIANTS[chosenIndex]),
  ];

  for (const variant of order) {
    if (variant === 'past-fight-pick' && built.pastPick) {
      return <PastFightCard payload={built.pastPick} />;
    }
    if (variant === 'hottest-take' && built.hottest) {
      return <HottestTakeCard payload={built.hottest} />;
    }
    if (variant === 'taste-callout' && built.taste) {
      return <TasteCalloutCard payload={built.taste} />;
    }
  }

  return null;
}

function SpotlightShell({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-gradient-to-b from-primary/[0.06] to-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function PastFightCard({ payload }: { payload: { fight: any } }) {
  const f = payload.fight;
  return (
    <SpotlightShell icon={<Telescope size={11} />} label="A fight you might love">
      <Link href={`/fights/${f.id}`} className="block group">
        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
          {fighterLast(f.fighter1)} vs {fighterLast(f.fighter2)}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-text-secondary">
          <span className="truncate">{f.event?.name ?? ''}</span>
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
            <Star
              size={28}
              fill={getHypeHeatmapColor(f.averageRating ?? 0)}
              color={getHypeHeatmapColor(f.averageRating ?? 0)}
              strokeWidth={1.5}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_70%)]">
              {Math.round(f.averageRating ?? 0)}
            </span>
          </span>
        </div>
        <p className="mt-2 text-[10px] text-text-secondary">
          {f.totalRatings} fans agreed.
        </p>
      </Link>
    </SpotlightShell>
  );
}

function HottestTakeCard({ payload }: { payload: { fight: any; delta: number } }) {
  const f = payload.fight;
  const delta = payload.delta;
  const direction = f.userRating > f.averageRating ? 'higher' : 'lower';
  return (
    <SpotlightShell icon={<Flame size={11} />} label="Your hottest take">
      <Link href={`/fights/${f.id}`} className="block group">
        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
          {fighterLast(f.fighter1)} vs {fighterLast(f.fighter2)}
        </p>
        <div className="mt-1 grid grid-cols-2 gap-2 text-center">
          <div className="rounded bg-primary/15 px-2 py-1">
            <p className="text-[9px] uppercase tracking-wide text-text-secondary">You</p>
            <p className="text-sm font-bold text-primary">{f.userRating.toFixed(1)}</p>
          </div>
          <div className="rounded bg-background-secondary px-2 py-1">
            <p className="text-[9px] uppercase tracking-wide text-text-secondary">Crowd</p>
            <p className="text-sm font-bold text-foreground">{f.averageRating.toFixed(1)}</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-text-secondary">
          {delta.toFixed(1)} points {direction} than the crowd.
        </p>
      </Link>
    </SpotlightShell>
  );
}

function TasteCalloutCard({ payload }: { payload: { avg: number } }) {
  const userAvg = payload.avg;
  // Community baseline ~7.2 — derived from observed app distributions; could be
  // surfaced from the backend later. Wording stays neutral for borderline cases.
  const COMMUNITY_AVG = 7.2;
  const diff = userAvg - COMMUNITY_AVG;
  let line: string;
  if (Math.abs(diff) < 0.3) {
    line = "You rate right in line with the community average.";
  } else if (diff > 0) {
    line = `You're a touch more generous than average. The crowd sits around ${COMMUNITY_AVG.toFixed(1)}.`;
  } else {
    line = `You rate tougher than the crowd. The community sits around ${COMMUNITY_AVG.toFixed(1)}.`;
  }
  return (
    <SpotlightShell icon={<Sparkles size={11} />} label="Your taste">
      <div className="text-center">
        <p className="text-2xl font-bold text-primary">{userAvg.toFixed(1)}</p>
        <p className="text-[10px] uppercase tracking-wide text-text-secondary">
          Your average rating
        </p>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">{line}</p>
    </SpotlightShell>
  );
}
