'use client';

import { useQuery } from '@tanstack/react-query';
import { getFollowedFighters } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function FollowedFightersPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['followedFighters'],
    queryFn: getFollowedFighters,
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  const fighters = data?.fighters ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/profile" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={14} />
        Profile
      </Link>
      <h1 className="mb-4 text-lg font-bold">Followed Fighters</h1>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fighters.map((fighter: any) => (
          <Link key={fighter.id} href={`/fighters/${fighter.id}`} className="block">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-background">
                {fighter.profileImage ? (
                  <img src={fighter.profileImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary">
                    {fighter.firstName?.[0]}{fighter.lastName?.[0]}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{fighter.firstName} {fighter.lastName}</p>
                <p className="text-xs text-text-secondary">
                  {fighter.wins}-{fighter.losses}-{fighter.draws}
                  {fighter.weightClass ? ` - ${fighter.weightClass}` : ''}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {!isLoading && fighters.length === 0 && (
        <p className="py-12 text-center text-sm text-text-secondary">
          You&apos;re not following any fighters yet. Follow fighters from their profile pages.
        </p>
      )}
    </div>
  );
}
