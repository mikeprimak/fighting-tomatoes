'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, X } from 'lucide-react';
import {
  getEventBroadcasts,
  type BroadcastEntry,
  type BroadcastRegion,
  type BroadcastTier,
  type CardSection,
  type HowToWatchResponse,
} from '@/lib/api';
import { useBroadcastRegion } from '@/lib/broadcastRegion';

const REGION_CC: Record<BroadcastRegion, string> = {
  US: 'us',
  CA: 'ca',
  GB: 'gb',
  AU: 'au',
  NZ: 'nz',
  EU: 'eu',
};

function FlagIcon({ region, size = 16 }: { region: BroadcastRegion; size?: number }) {
  const cc = REGION_CC[region];
  // flagcdn.com serves ISO 3166-1 SVG flags with a 4:3 ratio. Render at 4×height
  // and scale via height/width for crisp inline display alongside text.
  return (
    <img
      src={`https://flagcdn.com/${cc}.svg`}
      alt={`${region} flag`}
      width={Math.round((size * 4) / 3)}
      height={size}
      style={{ display: 'inline-block', objectFit: 'cover', borderRadius: 2, verticalAlign: 'middle' }}
    />
  );
}

const REGION_LABELS: Record<BroadcastRegion, string> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  AU: 'Australia',
  NZ: 'New Zealand',
  EU: 'Europe',
};

const REGION_ORDER: BroadcastRegion[] = ['US', 'CA', 'GB', 'AU', 'NZ', 'EU'];

const TIER_LABEL: Record<BroadcastTier, string> = {
  FREE: 'Free',
  SUBSCRIPTION: 'Sub',
  PPV: 'PPV',
};

const TIER_BG: Record<BroadcastTier, string> = {
  FREE: 'bg-green-600',
  PPV: 'bg-danger',
  SUBSCRIPTION: 'bg-blue-500',
};

const COLLAPSE_THRESHOLD = 2;

interface Props {
  eventId: string;
  /** Filter to one card section. Omit to show whole-event ("ALL") broadcasts only. */
  section?: CardSection;
  /** Optional inline label (e.g. "MAIN CARD"). Replaces the default "On:" label. */
  label?: string;
  /** Optional time string (e.g. "10pm") rendered next to the label. */
  time?: string;
}

export function HowToWatch({ eventId, section, label, time }: Props) {
  const { region: regionOverride, setRegion } = useBroadcastRegion();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<HowToWatchResponse>({
    queryKey: ['event-broadcasts', eventId, regionOverride ?? 'auto'],
    queryFn: () => getEventBroadcasts(eventId, regionOverride ?? undefined),
    staleTime: 5 * 60 * 1000,
  });

  const matching = useMemo(() => {
    if (!data) return [] as BroadcastEntry[];
    return data.broadcasts.filter((b) =>
      section ? b.cardSection === section : b.cardSection === null,
    );
  }, [data, section]);

  if (isLoading || !data || matching.length === 0) return null;

  const region = data.region;
  const visible = expanded || matching.length <= COLLAPSE_THRESHOLD
    ? matching
    : matching.slice(0, COLLAPSE_THRESHOLD);
  const hidden = matching.length - visible.length;

  const handleSelectRegion = async (r: BroadcastRegion | null) => {
    setPickerOpen(false);
    await setRegion(r);
  };

  return (
    <>
      <div className="my-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5">
        {visible.map((entry, idx) => (
          <BroadcastRow
            key={entry.id}
            entry={entry}
            isFirst={idx === 0}
            region={region}
            onRegionPress={() => setPickerOpen(true)}
            label={label}
            time={time}
          />
        ))}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="block w-full pl-[78px] pt-1 text-left text-[11px] italic text-text-secondary hover:text-foreground"
          >
            + {hidden} more option{hidden > 1 ? 's' : ''}
          </button>
        )}

        {/* Affiliate disclosure: only on the whole-event (top) card per screen,
            not the per-section cards below it — otherwise it repeats. */}
        {!section && matching.some((e) => e.deepLink) && (
          <p className="mt-1 border-t border-border/50 pt-1 text-[10px] italic leading-tight text-text-secondary opacity-70">
            Some &ldquo;How to Watch&rdquo; links are affiliate links. We may earn a commission.
          </p>
        )}
      </div>

      {pickerOpen && (
        <RegionPickerModal
          currentRegion={region}
          onClose={() => setPickerOpen(false)}
          onSelect={handleSelectRegion}
        />
      )}
    </>
  );
}

function BroadcastRow({
  entry, isFirst, region, onRegionPress, label, time,
}: {
  entry: BroadcastEntry;
  isFirst: boolean;
  region: BroadcastRegion;
  onRegionPress: () => void;
  label?: string;
  time?: string;
}) {
  const tierBg = TIER_BG[entry.tier];
  const rowContent = (
    <>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold text-text-secondary">
          {entry.channel.name}
        </span>
      </div>
      <span className={`mr-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ${tierBg}`}>
        {TIER_LABEL[entry.tier]}
      </span>
      {entry.deepLink && (
        <ChevronRight size={14} className="text-text-secondary" />
      )}
    </>
  );

  return (
    <div className="flex items-center gap-2 py-1">
      {isFirst ? (
        <button
          type="button"
          onClick={onRegionPress}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-text-secondary hover:border-primary/40 hover:text-foreground"
          style={{ minWidth: 64 }}
        >
          <FlagIcon region={region} size={12} />
          <span>{region}</span>
        </button>
      ) : (
        <div className="shrink-0" style={{ width: 64 }} />
      )}

      {isFirst && (
        <div className="flex shrink-0 items-baseline gap-1 pr-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            {label ?? 'On:'}
          </span>
          {time && (
            <span className="text-[10px] font-medium tracking-wide text-text-secondary opacity-90">
              {time}
            </span>
          )}
        </div>
      )}

      {!isFirst && (
        <div className="shrink-0" style={{ width: label ? 80 : 24 }} />
      )}

      {entry.deepLink ? (
        <a
          href={entry.deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center"
        >
          {rowContent}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center">{rowContent}</div>
      )}
    </div>
  );
}

function RegionPickerModal({
  currentRegion, onClose, onSelect,
}: {
  currentRegion: BroadcastRegion;
  onClose: () => void;
  onSelect: (region: BroadcastRegion | null) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">Watch region</h3>
            <p className="text-xs text-text-secondary">We use this to pick the right broadcaster.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-secondary hover:bg-background hover:text-foreground"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex w-full items-center gap-3 border-b border-border py-3 text-left hover:bg-background"
        >
          <span className="text-xl">📍</span>
          <span className="flex-1 text-sm text-foreground">Auto-detect from location</span>
        </button>

        {REGION_ORDER.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onSelect(r)}
            className="flex w-full items-center gap-3 border-b border-border py-3 text-left hover:bg-background"
          >
            <FlagIcon region={r} size={20} />
            <span className="flex-1 text-sm text-foreground">{REGION_LABELS[r]}</span>
            {currentRegion === r && <span className="text-base font-bold text-primary">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Shared cached fetch — parents can call this to know whether a section has
 * per-section broadcasts so they can suppress their own section divider.
 */
export function useEventBroadcasts(eventId: string) {
  const { region } = useBroadcastRegion();
  return useQuery<HowToWatchResponse>({
    queryKey: ['event-broadcasts', eventId, region ?? 'auto'],
    queryFn: () => getEventBroadcasts(eventId, region ?? undefined),
    staleTime: 5 * 60 * 1000,
    enabled: !!eventId,
  });
}
