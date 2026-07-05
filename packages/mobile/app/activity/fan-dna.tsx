/**
 * Fan DNA — the full-screen mirror.
 *
 * Revamped 2026-07-04 onto the taste-profile engine
 * (services/fanDNA/tasteProfile): ranked insights + the rotating identity
 * noun are the whole screen. The old trait-card list and the frozen
 * personalityType card are gone — the single-label engine is shelved per the
 * locked signature decision (identity-platform.md 2026-06-09: rotating
 * stream only, no "you are X" type).
 *
 * Voice per Good_Fights_Voice_Guide: the header is the friend talking
 * ("Here's what your ratings gave away"), insights carry the voice, and the
 * plumbing (loading, errors, empty states) stays plain. Silence > filler:
 * no insights means an honest empty state, never fake ones.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { getHypeHeatmapColor } from '../../utils/heatmap';

// Hidden 2026-05-18 — list works but the row layout/copy needs another pass
// before users see it. Flip to true when ready to ship.
const SHOW_HOT_TAKES_LIST = false;

// The full screen shows more than the home rail's three, still ranked.
const MAX_INSIGHTS = 12;

export default function FanDNAScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const styles = createStyles(colors);

  // Same day-salt as the home rail so the two surfaces agree with each other
  // within a day and both turn over tomorrow.
  const todaySalt = new Date().toISOString().slice(0, 10);

  const tasteQuery = useQuery({
    queryKey: ['tasteProfile', 'fullScreen', todaySalt],
    queryFn: () => apiService.getTasteProfile(MAX_INSIGHTS, false, todaySalt),
  });

  const hypeAccuracyQuery = useQuery({
    queryKey: ['hypeAccuracy', 100],
    queryFn: () => apiService.getHypeAccuracy(100),
    enabled: SHOW_HOT_TAKES_LIST,
  });

  useFocusEffect(
    useCallback(() => {
      tasteQuery.refetch();
      if (SHOW_HOT_TAKES_LIST) hypeAccuracyQuery.refetch();
    }, [tasteQuery.refetch, hypeAccuracyQuery.refetch]),
  );

  const insights = tasteQuery.data?.insights ?? [];
  const identity = tasteQuery.data?.identity ?? null;
  const ratedCount = tasteQuery.data?.baseline?.count ?? 0;
  const hotTakes =
    (hypeAccuracyQuery.data?.fights ?? []).filter((f) => f.isHotTake);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Fan DNA',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }} style={{ paddingVertical: 10, paddingHorizontal: 16, marginLeft: -8 }}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={tasteQuery.isFetching}
              onRefresh={() => tasteQuery.refetch()}
              tintColor={colors.textSecondary}
            />
          }
        >
          {tasteQuery.isLoading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Reading your ratings…</Text>
            </View>
          ) : tasteQuery.error ? (
            <View style={styles.centerBlock}>
              <FontAwesome name="exclamation-triangle" size={32} color={colors.danger} />
              <Text style={[styles.loadingText, { color: colors.danger }]}>Couldn't load Fan DNA</Text>
              <TouchableOpacity
                onPress={() => tasteQuery.refetch()}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : insights.length === 0 ? (
            <View style={styles.centerBlock}>
              <Text style={styles.emptyTitle}>Nothing to read yet</Text>
              <Text style={styles.emptyBody}>
                Rate some fights. The patterns show up on their own.
              </Text>
            </View>
          ) : (
            <>
              {/* Hero: rotating identity noun + what it means + the fights
                  behind it. No identity = no hero block (silence > filler). */}
              <View style={styles.heroBlock}>
                {identity ? (
                  <>
                    <Text style={styles.heroEyebrow}>THIS WEEK YOU'RE A</Text>
                    <Text style={styles.heroIdentity}>{identity.label}</Text>
                    <Text style={styles.heroExplanation}>
                      {identity.explanation}
                    </Text>
                    {identity.evidence ? (
                      <Text style={styles.heroEvidence}>{identity.evidence}</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.heroSubtitle}>
                    Here's what your ratings gave away.
                  </Text>
                )}
              </View>

              <View style={{ gap: 12 }}>
                {insights.map((insight) => (
                  <View key={insight.key} style={styles.card}>
                    <Text style={styles.cardHeadline}>{insight.headline}</Text>
                    <Text style={styles.cardBody}>{insight.subline}</Text>
                    {insight.evidence ? (
                      <Text style={styles.cardEvidence}>{insight.evidence}</Text>
                    ) : null}
                  </View>
                ))}
              </View>

              {ratedCount > 0 ? (
                <Text style={styles.footerStat}>
                  {ratedCount.toLocaleString()} {ratedCount === 1 ? 'fight' : 'fights'} rated
                </Text>
              ) : null}
            </>
          )}

          {SHOW_HOT_TAKES_LIST && hotTakes.length > 0 && (
            <View style={styles.hotTakesBlock}>
              <View style={styles.hotTakesHeader}>
                <FontAwesome name="fire" size={16} color="#F59E0B" />
                <Text style={styles.hotTakesTitle}>Hot Takes</Text>
                <Text style={styles.hotTakesCount}>{hotTakes.length}</Text>
              </View>
              <Text style={styles.hotTakesSubtitle}>
                You called it before the fight when the crowd had it wrong.
              </Text>
              <View style={{ gap: 8, marginTop: 12 }}>
                {hotTakes.slice(0, 20).map((take) => (
                  <TouchableOpacity
                    key={take.fightId}
                    style={styles.hotTakeRow}
                    onPress={() => router.push(`/fight/${take.fightId}?mode=completed` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hotTakeFight} numberOfLines={1}>
                        {take.fighter1Name} vs {take.fighter2Name}
                      </Text>
                      <Text style={styles.hotTakeMeta} numberOfLines={1}>
                        {take.eventName}
                      </Text>
                    </View>
                    <View style={styles.hotTakeStats}>
                      <Text style={[styles.hotTakeHype, { color: getHypeHeatmapColor(take.userHype) }]}>
                        {take.userHype}
                      </Text>
                      <Text style={styles.hotTakeRoom}>
                        avg {take.communityAvg.toFixed(1)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: 16, paddingBottom: 32 },
    heroBlock: {
      paddingTop: 12,
      paddingBottom: 18,
      gap: 4,
    },
    heroEyebrow: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.textSecondary,
    },
    heroIdentity: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.primary,
      lineHeight: 36,
    },
    heroExplanation: {
      fontSize: 14,
      color: colors.text,
      marginTop: 6,
      lineHeight: 20,
    },
    heroEvidence: {
      fontSize: 12,
      fontStyle: 'italic',
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: 17,
    },
    heroSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: 19,
    },
    centerBlock: {
      alignItems: 'center',
      paddingVertical: 32,
      gap: 12,
    },
    loadingText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    retryButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.primary,
      borderRadius: 8,
      marginTop: 8,
    },
    retryText: { color: '#fff', fontWeight: '600' },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    emptyBody: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 300,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    cardHeadline: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      lineHeight: 23,
    },
    cardBody: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 5,
      lineHeight: 18,
    },
    cardEvidence: {
      fontSize: 12,
      fontStyle: 'italic',
      color: colors.textSecondary,
      opacity: 0.85,
      marginTop: 6,
      lineHeight: 16,
    },
    footerStat: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 20,
    },
    hotTakesBlock: {
      marginTop: 28,
      padding: 14,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hotTakesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    hotTakesTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },
    hotTakesCount: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    hotTakesSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    hotTakeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    hotTakeFight: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    hotTakeMeta: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    hotTakeStats: {
      alignItems: 'flex-end',
      marginLeft: 12,
    },
    hotTakeHype: {
      fontSize: 18,
      fontWeight: '700',
    },
    hotTakeRoom: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });
