'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareQuote, Hourglass } from 'lucide-react';
import { getTopComments } from '@/lib/api';
import { CommentCard } from '@/components/CommentCard';
import { SectionHeading } from './SectionHeading';

function useTopComments() {
  return useQuery({
    queryKey: ['home', 'top-comments'],
    queryFn: getTopComments,
    staleTime: 5 * 60 * 1000,
  });
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

/** Top Comments: the most-upvoted recent post-fight reviews (read-only here). */
export function TopCommentsSection() {
  const { data } = useTopComments();
  const comments = (data?.data ?? []).slice(0, 3);
  if (comments.length === 0) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Top Comments" icon={MessageSquareQuote} />
      <div className="space-y-2">
        {comments.map((c: any) => (
          <CommentCard key={c.id} item={c} meta={<FightMeta fight={c.fight} />} />
        ))}
      </div>
    </section>
  );
}

/** Classic Comments: a throwback review from a fight 1+ year old. */
export function ClassicCommentsSection() {
  const { data } = useTopComments();
  const throwback = data?.throwback;
  if (!throwback) return null;

  return (
    <section className="mb-8">
      <SectionHeading title="Classic Comments" icon={Hourglass} />
      <CommentCard item={throwback} meta={<FightMeta fight={throwback.fight} />} />
    </section>
  );
}
