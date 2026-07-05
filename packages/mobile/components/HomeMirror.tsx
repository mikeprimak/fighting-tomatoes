/**
 * Home mirror — the identity dashboard above the fold
 * (identity-platform.md, Phase 1 objective #1).
 *
 * Two zones, per the locked 2026-06-09 model:
 *   A. "This Week" urgency rail (deterministic, pinned while true): live-now
 *      events, events today, and the 1–2 soonest fights you hyped / with
 *      fighters you follow — from GET /api/home/mirror. Overflow collapses
 *      into a quiet "+N more" line (Mike, 2026-07-03: don't list all ten).
 *   B. "More about you" rotating rail: taste insights from
 *      GET /api/fan-dna/taste-profile, salted by calendar day.
 *
 * The greeting wears a rotating identity PILL ("KO Lover") from the same
 * endpoint — a noun, not a prose insight (Mike, 2026-07-03). Still rotating,
 * never a frozen type, per the locked signature decision.
 *
 * Copy rules (locked): human headline, number in the subline; silence over
 * filler — no data renders just the greeting, never fake insights.
 * Spoiler-safe: everything here is upcoming/live; no results are shown.
 */
import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

import { Colors } from '../constants/Colors';
import { useAuth } from '../store/AuthContext';
import {
  apiService,
  HomeMirrorEventCard,
  HomeMirrorPinnedFight,
} from '../services/api';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (d: string | Date): number =>
  Math.floor(new Date(d).getTime() / DAY_MS);

// The urgency rail is a glance, not a list — soonest couple of pins only.
const MAX_VISIBLE_PINS = 2;

/** "Today" / "Tomorrow" / "Saturday" — event days are UTC-day placeholders. */
function dayLabel(eventDate: string): string {
  const diff = dayKey(eventDate) - dayKey(new Date());
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Date(eventDate).toLocaleDateString(undefined, {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

/** Local wall-clock time of a real instant ("10:00 PM"). */
function timeLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "2 fights you hyped · Holloway is on this card" */
function eventReason(card: HomeMirrorEventCard): string {
  const parts: string[] = [];
  if (card.hypedFightCount === 1) parts.push('a fight you hyped');
  if (card.hypedFightCount > 1) parts.push(`${card.hypedFightCount} fights you hyped`);
  const names = card.followedFighterNames;
  if (names.length === 1) parts.push(`${names[0]} is on this card`);
  if (names.length === 2) parts.push(`${names[0]} and ${names[1]} are on this card`);
  if (names.length > 2) parts.push(`${names.length} fighters you follow are on this card`);
  return parts.join(' · ');
}

function HeadshotPair({
  fight,
  colors,
}: {
  fight: HomeMirrorPinnedFight;
  colors: any;
}) {
  const imgStyle = {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  } as const;
  return (
    <View style={{ flexDirection: 'row', width: 56, marginRight: 10 }}>
      {fight.fighter1.profileImage ? (
        <Image source={{ uri: fight.fighter1.profileImage }} style={imgStyle} />
      ) : (
        <View style={[imgStyle, { alignItems: 'center', justifyContent: 'center' }]}>
          <FontAwesome name="user" size={14} color={colors.textSecondary} />
        </View>
      )}
      <View style={{ marginLeft: -12 }}>
        {fight.fighter2.profileImage ? (
          <Image source={{ uri: fight.fighter2.profileImage }} style={imgStyle} />
        ) : (
          <View style={[imgStyle, { alignItems: 'center', justifyContent: 'center' }]}>
            <FontAwesome name="user" size={14} color={colors.textSecondary} />
          </View>
        )}
      </View>
    </View>
  );
}

export default function HomeMirror() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const styles = createStyles(colors);
  const { user, isAuthenticated } = useAuth();

  const todaySalt = new Date().toISOString().slice(0, 10);

  const { data: mirror } = useQuery({
    queryKey: ['homeMirror'],
    queryFn: () => apiService.getHomeMirror(),
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const { data: taste } = useQuery({
    queryKey: ['tasteProfile', 'homeRail', todaySalt],
    queryFn: () => apiService.getTasteProfile(4, false, todaySalt),
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000,
  });

  if (!isAuthenticated) return null;

  const firstName =
    user?.firstName?.trim() ||
    user?.displayName?.trim().split(' ')[0] ||
    null;

  const identityLabel = taste?.identityLabel ?? null;
  const railInsights = (taste?.insights ?? []).slice(0, 3);

  const liveEvents = mirror?.liveEvents ?? [];
  const todayEvents = mirror?.todayEvents ?? [];
  // Fights on today's cards are already summarized by the today-event card.
  const todayEventIds = new Set(todayEvents.map((e) => e.eventId));
  const allPins = (mirror?.pinnedFights ?? []).filter(
    (f) => !todayEventIds.has(f.eventId),
  );
  const visiblePins = allPins.slice(0, MAX_VISIBLE_PINS);
  const hiddenPinCount = allPins.length - visiblePins.length;

  const hasUrgency =
    liveEvents.length > 0 || todayEvents.length > 0 || visiblePins.length > 0;

  return (
    <View style={styles.container}>
      {/* Greeting + rotating identity pill */}
      <View style={styles.greetingBlock}>
        <Text style={styles.greeting}>
          {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        </Text>
        {identityLabel ? (
          <View style={styles.identityPill}>
            <FontAwesome name="star" size={10} color={colors.primary} />
            <Text style={styles.identityPillText}>{identityLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* A. This Week — pinned while true, never rotated away */}
      {hasUrgency ? (
        <View style={styles.sectionHeader}>
          <FontAwesome name="bolt" size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>This Week</Text>
        </View>
      ) : null}

      {liveEvents.map((card) => (
        <TouchableOpacity
          key={card.eventId}
          style={[styles.urgencyCard, styles.liveCard]}
          onPress={() => router.push(`/event/${card.eventId}` as any)}
          activeOpacity={0.8}
        >
          <View style={styles.urgencyHeader}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>LIVE NOW</Text>
          </View>
          <Text style={styles.urgencyTitle}>{card.name}</Text>
          {eventReason(card) ? (
            <Text style={styles.urgencyReason}>{eventReason(card)}</Text>
          ) : null}
        </TouchableOpacity>
      ))}

      {todayEvents.map((card) => {
        const time = timeLabel(card.mainStartTime);
        return (
          <TouchableOpacity
            key={card.eventId}
            style={styles.urgencyCard}
            onPress={() => router.push(`/event/${card.eventId}` as any)}
            activeOpacity={0.8}
          >
            <View style={styles.urgencyHeader}>
              <FontAwesome name="calendar" size={12} color={colors.primary} />
              <Text style={styles.todayLabel}>
                TONIGHT{time ? ` · MAIN CARD ${time.toUpperCase()}` : ''}
              </Text>
            </View>
            <Text style={styles.urgencyTitle}>{card.name}</Text>
            {eventReason(card) ? (
              <Text style={styles.urgencyReason}>{eventReason(card)}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}

      {visiblePins.map((fight) => (
        <TouchableOpacity
          key={fight.fightId}
          style={styles.pinnedRow}
          onPress={() => router.push(`/event/${fight.eventId}` as any)}
          activeOpacity={0.8}
        >
          <HeadshotPair fight={fight} colors={colors} />
          <View style={styles.pinnedText}>
            <Text style={styles.pinnedTitle} numberOfLines={1}>
              {fight.fighter1.name} vs {fight.fighter2.name}
            </Text>
            <Text style={styles.pinnedSub} numberOfLines={1}>
              {dayLabel(fight.eventDate)} · {fight.eventName}
            </Text>
          </View>
          {fight.hype != null ? (
            <View style={styles.badge}>
              <FontAwesome name="fire" size={11} color={colors.textOnAccent} />
              <Text style={styles.badgeText}>{fight.hype}</Text>
            </View>
          ) : fight.followedFighterNames.length > 0 ? (
            <View style={[styles.badge, styles.followBadge]}>
              <FontAwesome name="star" size={11} color={colors.primary} />
              <Text style={styles.followBadgeText}>Following</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ))}

      {hiddenPinCount > 0 ? (
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/events' as any)}
          activeOpacity={0.7}
        >
          <Text style={styles.morePins}>
            +{hiddenPinCount} more {hiddenPinCount === 1 ? 'fight' : 'fights'} you're
            watching this week
            <Text style={styles.morePinsLink}>  See all upcoming</Text>
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* B. Rotating insight rail — a fresh look in the mirror each day.
          Bordered container so the section reads as its own unit (Mike,
          2026-07-04). Heading voice per Good_Fights_Voice_Guide §7. */}
      {railInsights.length > 0 ? (
        <View style={styles.railContainer}>
          <Text style={styles.railHeading}>WHAT YOUR RATINGS GAVE AWAY</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.insightRailContent}
          >
            {railInsights.map((insight) => (
              <TouchableOpacity
                key={insight.key}
                style={styles.insightCard}
                onPress={() => router.push('/activity/fan-dna' as any)}
                activeOpacity={0.8}
              >
                <Text style={styles.insightHeadline}>{insight.headline}</Text>
                <Text style={styles.insightSubline} numberOfLines={2}>
                  {insight.subline}
                </Text>
                {insight.evidence ? (
                  <Text style={styles.insightEvidence} numberOfLines={2}>
                    {insight.evidence}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.bottomRule} />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  greetingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
  },
  identityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  identityPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  urgencyCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  liveCard: {
    borderColor: colors.danger,
  },
  urgencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  liveLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.danger,
  },
  todayLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.primary,
  },
  urgencyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  urgencyReason: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  pinnedText: {
    flex: 1,
    marginRight: 8,
  },
  pinnedTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  pinnedSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textOnAccent,
  },
  followBadge: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  followBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  morePins: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 4,
    marginLeft: 2,
  },
  morePinsLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  railContainer: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  railHeading: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  insightRailContent: {
    gap: 8,
    paddingRight: 8,
  },
  insightCard: {
    width: 260,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    padding: 14,
  },
  insightHeadline: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 5,
    lineHeight: 21,
  },
  insightSubline: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  insightEvidence: {
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.textSecondary,
    opacity: 0.85,
    marginTop: 6,
    lineHeight: 14,
  },
  bottomRule: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.6,
    marginTop: 14,
    marginBottom: 10,
  },
});
