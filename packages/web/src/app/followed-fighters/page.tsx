'use client';

import { useQuery } from '@tanstack/react-query';
import { getFollowedFighters } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PopularFightersBlock } from '@/components/sidebar/PopularFightersBlock';

function hasRecord(f: { wins?: number; losses?: number; draws?: number }): boolean {
  return (f.wins ?? 0) + (f.losses ?? 0) + (f.draws ?? 0) > 0;
}

function recordLine(f: any): string | null {
  const record = hasRecord(f) ? `${f.wins}-${f.losses}-${f.draws}` : null;
  if (record && f.weightClass) return `${record} · ${f.weightClass}`;
  if (record) return record;
  if (f.weightClass) return f.weightClass;
  return null;
}

export default function FollowedFightersPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['followedFighters'],
    queryFn: getFollowedFighters,
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  const fighters = data?.fighters ?? [];

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6">
      <div className="min-w-0">
        <Link
          href="/profile"
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary"
        >
          <ArrowLeft size={14} />
          Profile
        </Link>
        <h1 className="mb-4 text-lg font-bold">Followed Fighters</h1>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {fighters.map((fighter: any) => {
            const line = recordLine(fighter);
            return (
              <Link key={fighter.id} href={`/fighters/${fighter.id}`} className="block">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-background">
                    {fighter.profileImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fighter.profileImage}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary">
                        {fighter.firstName?.[0]}
                        {fighter.lastName?.[0]}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {fighter.firstName} {fighter.lastName}
                    </p>
                    {line ? <p className="truncate text-xs text-text-secondary">{line}</p> : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {!isLoading && fighters.length === 0 && (
          <p className="py-12 text-center text-sm text-text-secondary">
            You&apos;re not following any fighters yet. Follow fighters from their profile pages.
          </p>
        )}
      </div>

      <div className="mt-6 lg:mt-0">
        <PopularFightersBlock />
      </div>
    </div>
  );
}
