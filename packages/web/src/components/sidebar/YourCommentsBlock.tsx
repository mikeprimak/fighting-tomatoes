'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getMyComments, type MyComment } from '@/lib/api';
import { MessageCircle, TrendingUp, Clock, ChevronRight } from 'lucide-react';

// Daily rotation: hash(userId + day-of-year) % variantCount. Stable per day,
// changes overnight, varies between users.
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

const VARIANTS = ['top', 'recent'] as const;
type VariantId = (typeof VARIANTS)[number];

export function YourCommentsBlock() {
  const { user, isAuthenticated } = useAuth();

  const { data: topData, isFetched: topFetched } = useQuery({
    queryKey: ['myComments', 'top', user?.id ?? null],
    queryFn: () => getMyComments({ sortBy: 'upvotes', limit: 1 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const { data: recentData, isFetched: recentFetched } = useQuery({
    queryKey: ['myComments', 'recent', user?.id ?? null],
    queryFn: () => getMyComments({ sortBy: 'newest', limit: 1 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const queriesSettled = topFetched && recentFetched;

  const pick = useMemo(() => {
    if (!user) return null;
    const top = topData?.reviews?.[0] ?? null;
    const recent = recentData?.reviews?.[0] ?? null;

    // Build variant pool: only include variants with data AND a meaningful
    // signal (top needs at least 1 upvote — otherwise it's just the recent
    // comment with no distinguishing reason to highlight it).
    const available: Array<{ id: VariantId; comment: MyComment }> = [];
    if (top && top.upvotes > 0) available.push({ id: 'top', comment: top });
    if (recent) available.push({ id: 'recent', comment: recent });

    // Deduplicate when top === recent (e.g. user only has one comment).
    const deduped = available.filter(
      (entry, i, arr) => arr.findIndex(e => e.comment.id === entry.comment.id) === i,
    );
    if (deduped.length === 0) return null;

    const seed = `${user.id}-${dayKey()}`;
    const idx = pickVariantIndex(seed, deduped.length);
    return deduped[idx];
  }, [user, topData, recentData]);

  if (!isAuthenticated || !user) return null;
  if (!queriesSettled) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="h-16 animate-pulse rounded bg-background-secondary" />
      </div>
    );
  }
  if (!pick) return null;

  const { id: variantId, comment } = pick;
  const label =
    variantId === 'top' ? 'Your top comment' : 'You wrote this recently';
  const Icon = variantId === 'top' ? TrendingUp : Clock;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          <MessageCircle size={11} className="text-primary" />
          Your comments
        </h3>
        <Link
          href="/activity?filter=reviewed"
          className="flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-text-secondary hover:text-primary"
        >
          See all
          <ChevronRight size={12} />
        </Link>
      </div>

      <Link href={`/fights/${comment.fightId}`} className="block group">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-primary">
          <Icon size={11} />
          <span>{label}</span>
          <span className="text-text-secondary">
            · {comment.upvotes} upvote{comment.upvotes === 1 ? '' : 's'}
          </span>
        </div>
        <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-foreground group-hover:text-primary">
          &ldquo;{comment.content}&rdquo;
        </p>
        <p className="mt-1.5 truncate text-[10px] text-text-secondary">
          on {comment.fight.fighter1Name} vs {comment.fight.fighter2Name}
        </p>
      </Link>
    </div>
  );
}
