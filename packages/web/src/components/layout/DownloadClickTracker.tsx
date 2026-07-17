'use client';

import { useEffect } from 'react';
import { trackEventBeacon } from '@/lib/analytics';

/**
 * Captures every click on a link into the /download funnel, no matter where
 * the link lives (navbar, banner, sidebar, blog markdown). One delegated
 * listener instead of per-placement handlers — new "/download?..." links are
 * tracked automatically.
 *
 * This exists because /download server-redirects phones straight to their
 * store, so for the majority of users no client-side pageview ever fires
 * there; the click on the way in is the only observable moment. Placement
 * comes from the utm_medium the links already carry.
 */
export function DownloadClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.('a[href*="/download"]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href.startsWith('/download')) return;
      const params = new URLSearchParams(href.split('?')[1] || '');
      trackEventBeacon('app_download_click', {
        placement: params.get('utm_medium') || 'unknown',
        href,
      });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
