'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ProfileSidebar } from '@/components/sidebar/ProfileSidebar';
import { IdentityBlock } from '@/components/sidebar/IdentityBlock';
import { FanDNABlock } from '@/components/sidebar/FanDNABlock';

/**
 * Two-column shell: feed on the left, the profile sidebar on the right.
 * Switches to two columns at the `md` breakpoint (768px) so narrower laptops
 * keep the layout instead of collapsing to a single column with a full-width
 * sidebar strip. Below `md` the compact "about you" strip is shown above the
 * feed instead (the desktop sidebar is unreachable because feeds lazy-load
 * forever). Mirrors the home (Upcoming) page so Past / Live / Good Fights match.
 */
export function SidebarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_260px] md:gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      {/* Shown below md: compact "About you" strip above the feed. */}
      <div className="mb-6 space-y-4 md:hidden">
        <IdentityBlock />
        <FanDNABlock />
        <Link
          href="/profile"
          className="flex items-center justify-center gap-0.5 rounded-lg border border-border bg-card py-2 text-xs font-medium text-text-secondary hover:border-primary/30 hover:text-primary"
        >
          More about you
          <ChevronRight size={14} />
        </Link>
      </div>

      <div className="min-w-0">{children}</div>

      <div className="hidden md:block">
        <ProfileSidebar />
      </div>
    </div>
  );
}
