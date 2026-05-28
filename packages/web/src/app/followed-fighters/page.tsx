'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFollowedFighters } from '@/lib/api';
import { useAuth, useHasApp } from '@/lib/auth';
import { FighterAvatar } from '@/components/FighterAvatar';
import { FollowButton } from '@/components/FollowButton';
import { Loader2, Bell, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PopularFightersBlock } from '@/components/sidebar/PopularFightersBlock';
import { hasRecord } from '@/lib/record';

const NOTIF_CTA_DISMISSED_KEY = 'followed_fighters_notif_cta_dismissed';

/** "LIGHT_HEAVYWEIGHT" -> "Light Heavyweight" */
function formatWeightClass(wc?: string | null): string | null {
  if (!wc) return null;
  return wc
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function recordLine(f: any): string | null {
  const record = hasRecord(f) ? `${f.wins}-${f.losses}-${f.draws}` : null;
  const wc = formatWeightClass(f.weightClass);
  if (record && wc) return `${record} · ${wc}`;
  if (record) return record;
  if (wc) return wc;
  return null;
}

export default function FollowedFightersPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const hasApp = useHasApp();
  const router = useRouter();
  const [ctaDismissed, setCtaDismissed] = useState(true);

  useEffect(() => {
    try {
      setCtaDismissed(window.localStorage.getItem(NOTIF_CTA_DISMISSED_KEY) === '1');
    } catch {
      setCtaDismissed(false);
    }
  }, []);

  const dismissCta = () => {
    try {
      window.localStorage.setItem(NOTIF_CTA_DISMISSED_KEY, '1');
    } catch {}
    setCtaDismissed(true);
  };

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
        <h1 className="text-lg font-bold">Followed Fighters</h1>
        <p className="mb-4 mt-1 text-xs text-text-secondary">
          {hasApp ? (
            <>Follow to save them. You&apos;ll be notified in the app for upcoming fights.</>
          ) : (
            <>
              Follow to save them.{' '}
              <a
                href="https://goodfights.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Get the mobile app
              </a>{' '}
              to be notified for upcoming fights.
            </>
          )}
        </p>

        {!ctaDismissed && !hasApp && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/30 bg-gradient-to-b from-primary/[0.08] to-card p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Bell size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Never miss a Good Fight.
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Push notifications are mobile-only. Install Good Fights on iOS or Android to get pinged when fighters you follow are booked or walking out.
              </p>
              <a
                href="https://goodfights.app"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
              >
                Get the app
              </a>
            </div>
            <button
              type="button"
              onClick={dismissCta}
              className="shrink-0 rounded p-1 text-text-secondary hover:bg-background hover:text-foreground"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {fighters.map((fighter: any) => {
            const line = recordLine(fighter);
            return (
              <div
                key={fighter.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/30"
              >
                <Link href={`/fighters/${fighter.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-background">
                    <FighterAvatar
                      src={fighter.profileImage}
                      initials={`${fighter.firstName?.[0] ?? ''}${fighter.lastName?.[0] ?? ''}`}
                      imgClassName="h-full w-full object-cover"
                      initialsClassName="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {fighter.firstName} {fighter.lastName}
                    </p>
                    {line ? <p className="truncate text-xs text-text-secondary">{line}</p> : null}
                  </div>
                </Link>
                <FollowButton fighterId={fighter.id} isFollowing />
              </div>
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
