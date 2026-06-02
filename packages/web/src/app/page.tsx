import type { Metadata } from 'next';
import { HomeClient } from './HomeClient';

// Self-referencing canonical. Legacy fightingtomatoes.com URLs land here with
// junk query strings (?sortby=…, ?pagenumber=…, ?u=…); pointing them all at the
// bare homepage resolves Search Console's "Duplicate without user-selected
// canonical" by consolidating every query-param variant to https://goodfights.app/.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return <HomeClient />;
}
