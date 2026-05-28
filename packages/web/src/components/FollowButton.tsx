'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { followFighter, unfollowFighter } from '@/lib/api';

interface FollowButtonProps {
  fighterId: string;
  isFollowing: boolean;
  // 'condensed' = icon-only badge (cards, rows, sidebar — default).
  // 'large' = labeled pill ("Follow" / "Following") for prominent spots like fighter pages.
  variant?: 'condensed' | 'large';
  className?: string;
}

export function FollowButton({ fighterId, isFollowing, variant = 'condensed', className }: FollowButtonProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = useState(isFollowing);
  // Tracks the user's last intent so a stale refetch can't overwrite it.
  const intentRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (intentRef.current === null || intentRef.current === isFollowing) {
      intentRef.current = null;
      setOptimistic(isFollowing);
    }
  }, [isFollowing]);

  const mutation = useMutation({
    mutationFn: (currentlyFollowing: boolean) =>
      currentlyFollowing ? unfollowFighter(fighterId) : followFighter(fighterId),
    onMutate: (currentlyFollowing) => {
      intentRef.current = !currentlyFollowing;
      setOptimistic(!currentlyFollowing);
    },
    onError: (_err, currentlyFollowing) => {
      intentRef.current = null;
      setOptimistic(currentlyFollowing);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['followedFighters'] });
      queryClient.invalidateQueries({ queryKey: ['topFollowedFighters'] });
      queryClient.invalidateQueries({ queryKey: ['recommendedFighters'] });
      queryClient.invalidateQueries({ queryKey: ['fighter', fighterId] });
    },
  });

  if (!isAuthenticated) return null;

  const following = optimistic;

  const handleClick = () => {
    const current = intentRef.current ?? optimistic;
    mutation.mutate(current);
  };

  if (variant === 'large') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={mutation.isPending}
        aria-pressed={following}
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
          following
            ? 'bg-primary text-text-on-accent'
            : 'border border-primary text-primary hover:bg-primary/10'
        } ${className ?? ''}`}
      >
        {following ? <Check size={15} /> : <UserPlus size={15} />}
        {following ? 'Following' : 'Follow'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={mutation.isPending}
      aria-pressed={following}
      aria-label={following ? 'Unfollow fighter' : 'Follow fighter'}
      className={`shrink-0 rounded-full border p-1 transition-colors disabled:opacity-60 ${
        following
          ? 'border-primary bg-primary text-text-on-accent'
          : 'border-primary/40 text-primary hover:bg-primary/10'
      } ${className ?? ''}`}
    >
      {following ? <Check size={12} /> : <UserPlus size={12} />}
    </button>
  );
}
