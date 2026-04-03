'use client';

import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { User, LogIn } from 'lucide-react';

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
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card text-2xl font-bold text-primary">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            user.displayName?.[0] || user.email[0].toUpperCase()
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold">{user.displayName || 'User'}</h1>
          <p className="text-sm text-text-secondary">{user.email}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4 rounded-lg border border-border bg-card p-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">{user.totalRatings || 0}</p>
          <p className="text-xs text-text-secondary">Ratings</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">{user.totalReviews || 0}</p>
          <p className="text-xs text-text-secondary">Reviews</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">{user.totalHype || 0}</p>
          <p className="text-xs text-text-secondary">Hype Scores</p>
        </div>
      </div>

      {/* Links */}
      <div className="space-y-2">
        <Link href="/profile/edit" className="block rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30">
          Edit Profile & Settings
        </Link>
        <Link href="/activity" className="block rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30">
          My Activity
        </Link>
        <Link href="/followed-fighters" className="block rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30">
          Followed Fighters
        </Link>
      </div>
    </div>
  );
}
