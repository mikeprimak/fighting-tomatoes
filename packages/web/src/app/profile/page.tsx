'use client';

import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { User, LogIn } from 'lucide-react';
import { IdentityBlock } from '@/components/sidebar/IdentityBlock';
import { FollowedFightersStrip } from '@/components/sidebar/FollowedFightersStrip';
import { SpotlightBlock } from '@/components/sidebar/SpotlightBlock';
import { UpcomingHypedBlock } from '@/components/sidebar/UpcomingHypedBlock';
import { MightLikeBlock } from '@/components/sidebar/MightLikeBlock';
import { FanDNABlock } from '@/components/sidebar/FanDNABlock';
import { DistributionBlock } from '@/components/sidebar/DistributionBlock';
import { YourCommentsBlock } from '@/components/sidebar/YourCommentsBlock';

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <User className="text-text-secondary" size={48} />
        <p className="text-text-secondary">Sign in to view your profile</p>
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-medium text-text-on-accent"
        >
          <LogIn size={16} />
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <IdentityBlock />
      <FanDNABlock />
      <DistributionBlock />
      <YourCommentsBlock />
      <FollowedFightersStrip />
      <UpcomingHypedBlock />
      <SpotlightBlock />
      <MightLikeBlock />

      <div className="space-y-2 pt-2">
        <Link
          href="/profile/edit"
          className="block rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30"
        >
          Edit Profile & Settings
        </Link>
        <Link
          href="/activity"
          className="block rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30"
        >
          My Activity
        </Link>
        <Link
          href="/followed-fighters"
          className="block rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30"
        >
          Followed Fighters
        </Link>
      </div>
    </div>
  );
}
