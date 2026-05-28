'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useAuth, useHasApp } from '@/lib/auth';

const DISMISS_KEY = 'appDownloadBannerDismissed';
const APP_URL = 'https://goodfights.app?utm_source=web&utm_medium=banner&utm_campaign=get-the-app';

export function AppDownloadBanner() {
  const { isLoading } = useAuth();
  const hasApp = useHasApp();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      // localStorage unavailable — show the banner.
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore — dismissal won't persist across reloads.
    }
  };

  // Wait for mount (avoid hydration mismatch) and auth resolution (avoid a
  // flash for accounts that already use the app). Hide for app users + once
  // dismissed.
  if (!mounted || isLoading || hasApp || dismissed) return null;

  return (
    <div className="relative flex items-center justify-center gap-3 bg-primary px-10 py-2 text-center text-sm font-medium text-text-on-accent">
      <a
        href={APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 hover:underline"
      >
        <Download size={16} className="shrink-0" />
        Download the Good Fights mobile app
      </a>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-on-accent/80 hover:text-text-on-accent"
      >
        <X size={16} />
      </button>
    </div>
  );
}
