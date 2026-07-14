import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { StoreButtons } from './StoreButtons';

const APP_STORE_URL = 'https://apps.apple.com/us/app/good-fights/id6757172609';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.fightcrewapp.mobile';

export const metadata: Metadata = {
  title: 'Get the App — Good Fights',
  description: 'Download the Good Fights app on iOS or Android.',
};

// Reading the user-agent opts this route into dynamic rendering so the
// per-device redirect is evaluated on every request.
export default async function DownloadPage() {
  const ua = (await headers()).get('user-agent') || '';

  // Phones skip the chooser and go straight to their store. Everything else
  // (desktop, tablets we can't classify, bots) sees the chooser below.
  if (/iPhone|iPad|iPod/i.test(ua)) redirect(APP_STORE_URL);
  if (/Android/i.test(ua)) redirect(PLAY_STORE_URL);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">Get the App</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Pick your phone to download. Never miss a Good Fight.
        </p>

        <StoreButtons appStoreUrl={APP_STORE_URL} playStoreUrl={PLAY_STORE_URL} />

        <Link
          href="/"
          className="mt-6 inline-block text-xs text-text-secondary underline hover:text-foreground"
        >
          ← Back to Good Fights
        </Link>
      </div>
    </div>
  );
}
