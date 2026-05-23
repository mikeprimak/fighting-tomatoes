'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { getFollowedFighters } from '@/lib/api';

const STRIP_LIMIT = 5;

export function FollowedFightersStrip() {
  const { user, isAuthenticated } = useAuth();

  const { data } = useQuery({
    queryKey: ['followedFighters', user?.id ?? null],
    queryFn: getFollowedFighters,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAuthenticated) return null;
  const fighters = data?.fighters ?? [];
  if (fighters.length === 0) return null;

  const visible = fighters.slice(0, STRIP_LIMIT);
  const overflow = fighters.length - visible.length;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Following
        </h3>
        <Link
          href="/followed-fighters"
          className="text-[10px] font-medium text-text-secondary hover:text-primary"
        >
          {fighters.length} · See all
        </Link>
      </div>

      <div className="flex gap-2">
        {visible.map((f: any) => {
          const initials = `${(f.firstName?.[0] ?? '')}${(f.lastName?.[0] ?? '')}`;
          const label = f.lastName || f.firstName || '';
          return (
            <Link
              key={f.id}
              href={`/fighters/${f.id}`}
              className="group flex min-w-0 flex-1 flex-col items-center"
            >
              <div className="h-10 w-10 overflow-hidden rounded-full bg-background-secondary ring-1 ring-border group-hover:ring-primary/60">
                {f.profileImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.profileImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-text-secondary">
                    {initials || '?'}
                  </div>
                )}
              </div>
              <span className="mt-1 w-full truncate text-center text-[10px] text-text-secondary group-hover:text-primary">
                {label}
              </span>
            </Link>
          );
        })}
        {overflow > 0 ? (
          <Link
            href="/followed-fighters"
            className="group flex min-w-0 flex-1 flex-col items-center"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background-secondary text-[10px] font-bold text-text-secondary ring-1 ring-border group-hover:text-primary group-hover:ring-primary/60">
              +{overflow}
            </div>
            <span className="mt-1 text-[10px] text-text-secondary">more</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
