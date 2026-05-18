import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService } from '../../services/api';
import { getHypeHeatmapColor } from '../../utils/heatmap';

const FAMILY_LABELS: Record<string, string> = {
  affinity: 'Affinity',
  behaviour: 'Behaviour',
  prediction: 'Prediction',
  identity: 'Identity',
};

const FAMILY_COLORS: Record<string, string> = {
  affinity: '#A78BFA',
  behaviour: '#60A5FA',
  prediction: '#34D399',
  identity: '#F59E0B',
};

// Hidden 2026-05-18 — list works but the row layout/copy needs another pass
// before users see it. Flip to true when ready to ship.
const SHOW_HOT_TAKES_LIST = false;

export default function FanDNAScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const styles = createStyles(colors);

  const profileQuery = useQuery({
    queryKey: ['fanDNAProfile'],
    queryFn: () => apiService.getFanDNAProfile(),
  });

  const hypeAccuracyQuery = useQuery({
    queryKey: ['hypeAccuracy', 100],
    queryFn: () => apiService.getHypeAccuracy(100),
  });

  useFocusEffect(
    useCallback(() => {
      profileQuery.refetch();
      hypeAccuracyQuery.refetch();
    }, [profileQuery.refetch, hypeAccuracyQuery.refetch]),
  );

  const cards = profileQuery.data?.cards ?? [];
  const personalityType = profileQuery.data?.personalityType ?? null;
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
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 16 }}>
              <FontAwesome name="chevron-left" size={20} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.heroBlock}>
            <FontAwesome6 name="dna" size={28} color={FAMILY_COLORS.affinity} />
            <Text style={styles.heroTitle}>Your Fan DNA</Text>
            <Text style={styles.heroSubtitle}>
              Patterns the app has learned from your ratings and hypes.
            </Text>
          </View>

          {personalityType && (
            <View style={styles.typeCard}>
              <Text style={styles.typeLabel}>YOUR TYPE</Text>
              <Text style={styles.typeName}>{personalityType.label}</Text>
              <Text style={styles.typeBody}>{personalityType.body}</Text>
              {personalityType.primaryStat ? (
                <View style={styles.typeStatRow}>
                  <Text style={styles.typeStatPrimary}>{personalityType.primaryStat}</Text>
                  {personalityType.secondaryStat ? (
                    <Text style={styles.typeStatSecondary}>{personalityType.secondaryStat}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}

          {profileQuery.isLoading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color={FAMILY_COLORS.affinity} />
              <Text style={styles.loadingText}>Computing your DNA…</Text>
            </View>
          ) : profileQuery.error ? (
            <View style={styles.centerBlock}>
              <FontAwesome name="exclamation-triangle" size={32} color={colors.danger} />
              <Text style={[styles.loadingText, { color: colors.danger }]}>Couldn't load Fan DNA</Text>
              <TouchableOpacity
                onPress={() => profileQuery.refetch()}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : cards.length === 0 ? (
            <View style={styles.centerBlock}>
              <Text style={styles.emptyTitle}>No DNA yet</Text>
              <Text style={styles.emptyBody}>
                Rate and hype more fights — patterns will surface here as the data builds.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {cards.map((card) => (
                <View key={card.traitId} style={styles.card}>
                  <View style={styles.cardRow}>
                    {card.primaryStat ? (
                      <View style={[styles.statBlock, { backgroundColor: `${FAMILY_COLORS[card.family] ?? '#888'}22` }]}>
                        <Text style={styles.statPrimary}>{card.primaryStat}</Text>
                        {card.secondaryStat ? (
                          <Text style={styles.statSecondary} numberOfLines={1}>
                            {card.secondaryStat}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <View style={styles.headlineRow}>
                        <Text style={styles.cardHeadline}>{card.headline}</Text>
                        <View
                          style={[
                            styles.familyChip,
                            { backgroundColor: `${FAMILY_COLORS[card.family] ?? '#888'}33` },
                          ]}
                        >
                          <Text
                            style={[
                              styles.familyChipText,
                              { color: FAMILY_COLORS[card.family] ?? colors.textSecondary },
                            ]}
                          >
                            {FAMILY_LABELS[card.family] ?? card.family}
                          </Text>
                        </View>
                      </View>
                      {card.body ? (
                        <Text style={styles.cardBody}>{card.body}</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {SHOW_HOT_TAKES_LIST && hotTakes.length > 0 && (
            <View style={styles.hotTakesBlock}>
              <View style={styles.hotTakesHeader}>
                <FontAwesome name="fire" size={16} color="#F59E0B" />
                <Text style={styles.hotTakesTitle}>Hot Takes</Text>
                <Text style={styles.hotTakesCount}>{hotTakes.length}</Text>
              </View>
              <Text style={styles.hotTakesSubtitle}>
                Fights where your hype was very different from the community, but you were right.
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
      alignItems: 'center',
      paddingVertical: 20,
      gap: 8,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
    },
    heroSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 280,
    },
    typeCard: {
      marginTop: 12,
      marginBottom: 4,
      padding: 18,
      borderRadius: 14,
      backgroundColor: 'rgba(167, 139, 250, 0.18)',
      borderWidth: 1,
      borderColor: 'rgba(167, 139, 250, 0.45)',
    },
    typeLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: '#A78BFA',
      letterSpacing: 0.6,
    },
    typeName: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      marginTop: 4,
    },
    typeBody: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 6,
      lineHeight: 20,
    },
    typeStatRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
      marginTop: 10,
    },
    typeStatPrimary: {
      fontSize: 26,
      fontWeight: '800',
      color: '#A78BFA',
    },
    typeStatSecondary: {
      fontSize: 12,
      color: colors.textSecondary,
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
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statBlock: {
      minWidth: 72,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
    },
    statPrimary: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    statSecondary: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 2,
    },
    headlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardHeadline: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    familyChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    familyChipText: {
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    cardBody: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: 18,
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
