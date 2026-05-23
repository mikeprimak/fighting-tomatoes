'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { VerticalDistributionChart } from '@/components/charts/VerticalDistributionChart';
import { Star, Flame } from 'lucide-react';

// Data floor — below this many entries the chart is too noisy to be useful and
// we hide the block. Matches the design doc's empty-room handling.
const MIN_ENTRIES = 5;

function sumDistribution(dist: Record<string, number> | undefined): number {
  if (!dist) return 0;
  let total = 0;
  for (const v of Object.values(dist)) total += v ?? 0;
  return total;
}

function average(dist: Record<string, number> | undefined): number | null {
  if (!dist) return null;
  let total = 0;
  let weighted = 0;
  for (const [k, v] of Object.entries(dist)) {
    const score = Number(k);
    if (!Number.isFinite(score)) continue;
    total += v;
    weighted += score * v;
  }
  return total > 0 ? weighted / total : null;
}

export function DistributionBlock() {
  const { user, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<'rating' | 'hype'>('rating');

  if (!isAuthenticated || !user) return null;

  const ratingDist = user.ratingDistribution ?? {};
  const hypeDist = user.hypeDistribution ?? {};
  const ratingCount = sumDistribution(ratingDist);
  const hypeCount = sumDistribution(hypeDist);

  // Hide entirely until at least one distribution clears the floor.
  if (ratingCount < MIN_ENTRIES && hypeCount < MIN_ENTRIES) return null;

  const ratingAvail = ratingCount >= MIN_ENTRIES;
  const hypeAvail = hypeCount >= MIN_ENTRIES;

  // Default to whichever has data if the user's preferred tab is empty.
  const activeTab = tab === 'rating' && !ratingAvail ? 'hype' : tab === 'hype' && !hypeAvail ? 'rating' : tab;

  const activeDist = activeTab === 'rating' ? ratingDist : hypeDist;
  const activeAvg = average(activeDist);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Your distribution
        </h3>
        <div className="flex gap-1">
          <TabButton
            active={activeTab === 'rating'}
            disabled={!ratingAvail}
            onClick={() => setTab('rating')}
            icon={<Star size={12} />}
            label="Ratings"
          />
          <TabButton
            active={activeTab === 'hype'}
            disabled={!hypeAvail}
            onClick={() => setTab('hype')}
            icon={<Flame size={12} />}
            label="Hype"
          />
        </div>
      </div>

      <VerticalDistributionChart
        distribution={activeDist}
        label={activeTab === 'rating' ? 'rating' : 'hype score'}
      />

      {activeAvg !== null && (
        <p className="mt-2 text-center text-[11px] text-text-secondary">
          Avg <span className="font-semibold text-foreground">{activeAvg.toFixed(1)}</span>
        </p>
      )}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
        active
          ? 'bg-primary/15 text-primary'
          : disabled
            ? 'text-text-secondary/40 cursor-not-allowed'
            : 'text-text-secondary hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
