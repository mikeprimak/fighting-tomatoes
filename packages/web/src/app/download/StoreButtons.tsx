'use client';

import { Apple, Smartphone } from 'lucide-react';
import { trackEventBeacon } from '@/lib/analytics';

export function StoreButtons({ appStoreUrl, playStoreUrl }: { appStoreUrl: string; playStoreUrl: string }) {
  return (
    <div className="mt-6 flex flex-col gap-3">
      <a
        href={appStoreUrl}
        onClick={() => trackEventBeacon('app_download_click', { placement: 'chooser', platform: 'ios' })}
        className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-bold text-text-on-accent transition hover:opacity-90"
      >
        <Apple size={20} className="shrink-0" />
        Download on the App Store
      </a>
      <a
        href={playStoreUrl}
        onClick={() => trackEventBeacon('app_download_click', { placement: 'chooser', platform: 'android' })}
        className="flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-3 font-bold text-foreground transition hover:bg-background-secondary"
      >
        <Smartphone size={20} className="shrink-0" />
        Get it on Google Play
      </a>
    </div>
  );
}
