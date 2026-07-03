/**
 * Home mirror — the identity dashboard above the fold
 * (identity-platform.md, Phase 1 objective #1).
 *
 * Two zones, per the locked 2026-06-09 model:
 *   A. Urgency rail (deterministic, pinned while true): live-now events,
 *      events today, and this week's fights you hyped / with fighters you
 *      follow — from GET /api/home/mirror.
 *   B. Rotating rail: taste insights from GET /api/fan-dna/taste-profile,
 *      salted by calendar day so the rail changes daily. The first insight
 *      doubles as the greeting's rotating identity line.
 *
 * Copy rules (locked): human headline, number in the subline; silence over
 * filler — an empty profile renders just the greeting, never fake insights.
 * Spoiler-safe: everything here is upcoming/live; no results are shown.
 */
import React from 'react';
import {
  View,
  Text,
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
} from '../services/api';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (d: string | Date): number =>
  Math.floor(new Date(d).getTime() / DAY_MS);

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

  const insights = taste?.insights ?? [];
  // The identity line is itself a rotating insight (locked model: no frozen
  // "you are X" label). The rail shows the rest.
  const identityLine = insights[0]?.headline ?? null;
  const railInsights = insights.slice(1, 4);

  const liveEvents = mirror?.liveEvents ?? [];
  const todayEvents = mirror?.todayEvents ?? [];
  // Fights on today's cards are already summarized by the today-event card.
  const todayEventIds = new Set(todayEvents.map((e) => e.eventId));
  const pinnedFights = (mirror?.pinnedFights ?? []).filter(
    (f) => !todayEventIds.has(f.eventId),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>
        {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
      </Text>
      {identityLine ? (
        <Text style={styles.identityLine}>{identityLine}</Text>
      ) : null}

      {/* A. Urgency rail — pinned while true, never rotated away */}
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

      {pinnedFights.map((fight) => (
        <TouchableOpacity
          key={fight.fightId}
          style={styles.pinnedRow}
          onPress={() => router.push(`/event/${fight.eventId}` as any)}
          activeOpacity={0.8}
        >
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

      {/* B. Rotating rail — a fresh look in the mirror each day */}
      {railInsights.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.insightRail}
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
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
  },
  identityLine: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 4,
  },
  urgencyCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 10,
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  pinnedText: {
    flex: 1,
    marginRight: 8,
  },
  pinnedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  pinnedSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
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
  insightRail: {
    marginTop: 12,
  },
  insightRailContent: {
    gap: 8,
    paddingRight: 8,
  },
  insightCard: {
    width: 240,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  insightHeadline: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  insightSubline: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
