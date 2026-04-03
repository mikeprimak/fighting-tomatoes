'use client';

import { getHypeHeatmapColor } from '@/utils/heatmap';

interface DistributionChartProps {
  distribution: Record<number | string, number>;
  label?: string;
}

export function DistributionChart({ distribution, label }: DistributionChartProps) {
  const entries: [number, number][] = [];
  for (let i = 1; i <= 10; i++) {
    entries.push([i, distribution[i] || distribution[String(i)] || 0]);
  }
  const maxCount = Math.max(...entries.map(([, c]) => c), 1);
  const total = entries.reduce((sum, [, c]) => sum + c, 0);

  return (
    <div className="space-y-1">
      {entries.map(([score, count]) => {
        const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
        const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const color = getHypeHeatmapColor(score);

        return (
          <div key={score} className="flex items-center gap-2">
            <span className="w-4 text-right text-xs font-medium text-text-secondary">{score}</span>
            <div className="flex-1">
              <div
                className="h-4 rounded-sm transition-all"
                style={{ width: `${Math.max(barWidth, 1)}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-10 text-right text-[10px] text-text-secondary">
              {count > 0 ? `${pct}%` : ''}
            </span>
          </div>
        );
      })}
      {total > 0 && (
        <p className="mt-1 text-center text-[10px] text-text-secondary">
          {total} {label ? label.toLowerCase() : ''}{total !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
