'use client';

import { Smartphone } from 'lucide-react';
import { useHasApp } from '@/lib/auth';

const APP_URL = '/download?utm_source=web&utm_medium=page-footer&utm_campaign=get-the-app';

/**
 * End-of-page "Download the app" CTA. Meant for the finite pages that have a
 * natural bottom — fighter, fight, event — NOT the infinitely-scrolling list
 * feeds (home, schedule, events lists), where a footer would never be reached.
 * Hidden for confirmed app users (mirrors the top AppDownloadBanner). No
 * dismiss control — it lives below the content, so it isn't intrusive.
 */
export function AppDownloadFooter() {
  const hasApp = useHasApp();
  if (hasApp) return null;

  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <a
        href={APP_URL}
        className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-8 text-center transition-colors hover:border-primary sm:flex-row sm:justify-center sm:gap-5 sm:text-left"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Smartphone size={24} />
        </span>
        <span>
          <span className="block text-base font-bold text-foreground">
            Get the Good Fights app
          </span>
          <span className="mt-0.5 block text-sm text-text-secondary">
            Rate fights, hype the card, and follow fighters — never miss a Good Fight.
          </span>
        </span>
        <span className="mt-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-text-on-accent sm:mt-0">
          Download
        </span>
      </a>
    </div>
  );
}
