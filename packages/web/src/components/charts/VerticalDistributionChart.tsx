'use client';

import { getHypeHeatmapColor } from '@/utils/heatmap';

interface VerticalDistributionChartProps {
  distribution: Record<number | string, number>;
  label?: string;
  /** Max height of the tallest bar, in px. */
  maxBarHeight?: number;
}

/**
 * Histogram-style chart with 1–10 on the X axis and bar height = count.
 * Used in the sidebar; `DistributionChart` (horizontal) stays for fight detail.
 */
export function VerticalDistributionChart({
  distribution,
  label,
  maxBarHeight = 60,
}: VerticalDistributionChartProps) {
  const entries: [number, number][] = [];
  for (let i = 1; i <= 10; i++) {
    entries.push([i, distribution[i] || distribution[String(i)] || 0]);
  }
  const maxCount = Math.max(...entries.map(([, c]) => c), 1);
  const total = entries.reduce((sum, [, c]) => sum + c, 0);

  return (
    <div>
      <div className="flex items-end justify-between gap-1" style={{ height: maxBarHeight }}>
        {entries.map(([score, count]) => {
          const barHeight = maxCount > 0 ? (count / maxCount) * maxBarHeight : 0;
          const color = getHypeHeatmapColor(score);
          return (
            <div key={score} className="flex flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${Math.max(barHeight, count > 0 ? 2 : 1)}px`,
                  backgroundColor: count > 0 ? color : 'var(--color-border)',
                  opacity: count > 0 ? 1 : 0.3,
                }}
                title={`${score}: ${count}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between gap-1">
        {entries.map(([score]) => (
          <div
            key={score}
            className="flex-1 text-center text-[9px] font-medium text-text-secondary"
          >
            {score}
          </div>
        ))}
      </div>
      {total > 0 && label ? (
        <p className="mt-1 text-center text-[10px] text-text-secondary">
          {total} {label.toLowerCase()}
          {total !== 1 ? 's' : ''}
        </p>
      ) : null}
    </div>
  );
}
