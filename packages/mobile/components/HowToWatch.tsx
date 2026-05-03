import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  useColorScheme,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../constants/Colors';
import {
  api,
  type HowToWatchResponse,
  type BroadcastTier,
  type BroadcastEntry,
  type BroadcastRegion,
  type CardSection,
} from '../services/api';
import { RegionPickerSheet, REGION_FLAGS } from './RegionPickerSheet';
import { useBroadcastRegion } from '../store/BroadcastRegionContext';

interface Props {
  eventId: string;
  /** Filter to one card section. Omit to show whole-event ("ALL") broadcasts only. */
  section?: CardSection;
  /** Optional inline label (e.g. "MAIN CARD"). Replaces the default "On:" label. */
  label?: string;
  /** Optional time string (e.g. "9:00 PM ET") rendered next to the label. */
  time?: string;
}

const TIER_LABEL: Record<BroadcastTier, string> = {
  FREE: 'Free',
  SUBSCRIPTION: 'Sub',
  PPV: 'PPV',
};

const COLLAPSE_THRESHOLD = 2;

export default function HowToWatch({ eventId, section, label, time }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const { region: regionOverride, setRegion } = useBroadcastRegion();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<HowToWatchResponse>({
    queryKey: ['event-broadcasts', eventId, regionOverride ?? 'auto'],
    queryFn: () => api.getEventBroadcasts(eventId, regionOverride ?? undefined),
    staleTime: 5 * 60 * 1000,
  });

  const matching = useMemo(() => {
    if (!data) return [] as BroadcastEntry[];
    return data.broadcasts.filter(b =>
      section ? b.cardSection === section : b.cardSection === null,
    );
  }, [data, section]);

  if (isLoading || !data || matching.length === 0) return null;

  const region = data.region;
  const visible = expanded || matching.length <= COLLAPSE_THRESHOLD
    ? matching
    : matching.slice(0, COLLAPSE_THRESHOLD);
  const hidden = matching.length - visible.length;

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
      {visible.map((entry, idx) => (
        <BroadcastRow
          key={entry.id}
          entry={entry}
          colors={colors}
          isFirst={idx === 0}
          region={region}
          onRegionPress={() => setPickerOpen(true)}
          label={label}
          time={time}
        />
      ))}

      {hidden > 0 && (
        <TouchableOpacity onPress={() => setExpanded(true)} style={styles.moreButton}>
          <Text style={[styles.moreText, { color: colors.textSecondary }]}>
            + {hidden} more option{hidden > 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      )}

      <RegionPickerSheet
        visible={pickerOpen}
        currentRegion={region}
        onClose={() => setPickerOpen(false)}
        onSelect={(r) => {
          setPickerOpen(false);
          setRegion(r);
        }}
      />
    </View>
  );
}

function BroadcastRow({
  entry, colors, isFirst, region, onRegionPress, label, time,
}: {
  entry: BroadcastEntry;
  colors: any;
  isFirst: boolean;
  region: BroadcastRegion;
  onRegionPress: () => void;
  label?: string;
  time?: string;
}) {
  const handlePress = () => {
    if (entry.deepLink) Linking.openURL(entry.deepLink).catch(() => {});
  };

  const tierBg =
    entry.tier === 'FREE' ? '#16a34a' :
    entry.tier === 'PPV' ? '#dc2626' :
    '#3b82f6';

  return (
    <View style={styles.row}>
      {isFirst ? (
        <TouchableOpacity onPress={onRegionPress} style={[styles.regionPill, { borderColor: colors.border }]} activeOpacity={0.7}>
          <Text style={[styles.regionPillText, { color: colors.textSecondary }]}>
            {REGION_FLAGS[region]} {region}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.regionSpacer} />
      )}

      {isFirst && (
        <View style={styles.labelGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
            {label ?? 'On:'}
          </Text>
          {time ? (
            <Text style={[styles.labelTime, { color: colors.textSecondary }]} numberOfLines={1}>
              {time}
            </Text>
          ) : null}
        </View>
      )}

      <TouchableOpacity
        onPress={handlePress}
        disabled={!entry.deepLink}
        style={styles.channelTap}
        activeOpacity={0.7}
      >
        <View style={styles.channelNameWrap}>
          <Text style={[styles.channelName, { color: colors.textSecondary }]} numberOfLines={1}>
            {entry.channel.name}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: tierBg }]}>
          <Text style={styles.badgeText}>{TIER_LABEL[entry.tier]}</Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const REGION_PILL_WIDTH = 64;

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  regionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    minWidth: REGION_PILL_WIDTH,
    alignItems: 'center',
  },
  regionPillText: { fontSize: 11, fontWeight: '600' },
  regionSpacer: { width: REGION_PILL_WIDTH, marginRight: 8 },
  labelGroup: {
    marginRight: 6,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  labelTime: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginLeft: 4,
    opacity: 0.85,
  },
  channelTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  channelNameWrap: {
    flex: 1,
    marginRight: 6,
  },
  channelName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'left',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  chevron: {
    fontSize: 16,
    width: 10,
    textAlign: 'right',
  },
  moreButton: {
    paddingVertical: 4,
    paddingLeft: REGION_PILL_WIDTH + 14,
  },
  moreText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});

/**
 * Shared cached fetch — parents can call this to know whether a section has
 * per-section broadcasts (and therefore HowToWatch will absorb the title) so
 * they can suppress their own section-title rendering.
 */
export function useEventBroadcasts(eventId: string) {
  const { region } = useBroadcastRegion();
  return useQuery<HowToWatchResponse>({
    queryKey: ['event-broadcasts', eventId, region ?? 'auto'],
    queryFn: () => api.getEventBroadcasts(eventId, region ?? undefined),
    staleTime: 5 * 60 * 1000,
  });
}
