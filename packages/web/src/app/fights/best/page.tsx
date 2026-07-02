import { redirect } from 'next/navigation';
import { fetchBestYears, indexableYears } from '@/lib/bestFights';

/**
 * /fights/best has no content of its own — it forwards to the most recent year
 * that has a real ranking. Temporary (not permanent) redirect: the target moves
 * every year.
 */
export default async function BestFightsIndexPage() {
  const years = indexableYears(await fetchBestYears());
  const target = years[0]?.year ?? new Date().getUTCFullYear();
  redirect(`/fights/best/${target}`);
}
