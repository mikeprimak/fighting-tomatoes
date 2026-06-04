'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareQuote, Hourglass } from 'lucide-react';
import { getTopComments, toggleReviewUpvote } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CommentCard } from '@/components/CommentCard';
import { SectionHeading } from './SectionHeading';

const TOP_COMMENTS_KEY = ['home', 'top-comments'] as const;

function useTopComments() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  return useQuery({
    // Key on auth so the per-user `userHasUpvoted` flags refetch on login/logout.
    queryKey: [...TOP_COMMENTS_KEY, isAuthenticated],
    queryFn: getTopComments,
    // Wait for auth to restore so the request carries the token (the backend
    // only sets userHasUpvoted when authenticated).
    enabled: !authLoading,
    staleTime: 5 * 60 * 1000,
  });
}

/** Optimistic upvote toggle shared by both comment bands. Both render off the
 *  same ['home','top-comments', auth] cache, so we patch the `data` array AND
 *  the `throwback` in place — no refetch, so the list doesn't re-sort while the
 *  user is reading it (mirrors the fight-detail CommentsSection). */
function useCommentUpvote() {
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();

  return async (comment: any) => {
    if (!isAuthenticated || !comment?.fight?.id) return;
    const key = [...TOP_COMMENTS_KEY, true];

    const toggle = (c: any) =>
      c && c.id === comment.id
        ? {
            ...c,
            userHasUpvoted: !c.userHasUpvoted,
            upvotes: (c.upvotes ?? 0) + (c.userHasUpvoted ? -1 : 1),
          }
        : c;

    const patch = (fn: (c: any) => any) =>
      qc.setQueryData(key, (old: any) =>
        old ? { ...old, data: (old.data ?? []).map(fn), throwback: fn(old.throwback) } : old,
      );

    // Optimistic in-place toggle.
    patch(toggle);

    try {
      const res: any = await toggleReviewUpvote(comment.fight.id, comment.id);
      const upvotes = res.upvotesCount;
      const voted = res.isUpvoted;
      if (typeof upvotes === 'number' && typeof voted === 'boolean') {
        patch((c: any) => (c && c.id === comment.id ? { ...c, upvotes, userHasUpvoted: voted } : c));
      }
    } catch {
      // Roll back by re-toggling from the optimistic state.
      patch(toggle);
    }
  };
}

/** Footer context for a comment: the fight it's on, linking to the fight page. */
function FightMeta({ fight }: { fight: any }) {
  if (!fight?.id) return null;
  return (
    <Link href={`/fights/${fight.id}`} className="font-semibold hover:text-primary">
      {fight.fighter1Name} vs {fight.fighter2Name}
      {fight.eventName ? ` · ${fight.eventName}` : ''}
    </Link>
  );
}

/** Top Comments: the most-upvoted recent post-fight reviews, upvotable inline. */
export function TopCommentsSection() {
  const { data } = useTopComments();
  const { isAuthenticated } = useAuth();
  const onUpvote = useCommentUpvote();
  const comments = (data?.data ?? []).slice(0, 3);
  if (comments.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Top Comments" icon={MessageSquareQuote} />
      <div className="space-y-2">
        {comments.map((c: any) => (
          <CommentCard
            key={c.id}
            item={c}
            onUpvote={isAuthenticated ? () => onUpvote(c) : undefined}
            meta={<FightMeta fight={c.fight} />}
          />
        ))}
      </div>
    </section>
  );
}

/** Classic Comments: a throwback review from a fight 1+ year old, upvotable inline. */
export function ClassicCommentsSection() {
  const { data } = useTopComments();
  const { isAuthenticated } = useAuth();
  const onUpvote = useCommentUpvote();
  const throwback = data?.throwback;
  if (!throwback) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Classic Comments" icon={Hourglass} />
      <CommentCard
        item={throwback}
        onUpvote={isAuthenticated ? () => onUpvote(throwback) : undefined}
        meta={<FightMeta fight={throwback.fight} />}
      />
    </section>
  );
}
