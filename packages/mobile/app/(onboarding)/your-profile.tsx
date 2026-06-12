/**
 * Onboarding step 4 (final) — THE payoff.
 *
 * Calls the taste-profile endpoint (fresh=true: the ratings and follows it
 * reflects landed seconds ago) and renders insights as cards: big human
 * headline, small stat subline (locked copy rule). Empty state is graceful —
 * count + average, never filler insights (silence > filler is a locked
 * engine principle; do not relax it here either). Runs AFTER the follow
 * picker (reordered 2026-06-12) so fighter-axis insights can draw on follows.
 * Finishing marks onboarding complete and lands in the main app.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService, TasteProfileResponse } from '../../services/api';
import { markOnboardingComplete } from '../../services/onboarding';

export default function YourProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const styles = createStyles(colors);

  const [profile, setProfile] = useState<TasteProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiService
      .getTasteProfile(undefined, true)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setIsLoading(false));
  }, []);

  const handleContinue = async () => {
    await markOnboardingComplete();
    router.replace('/(tabs)');
  };

  const insights = profile?.insights ?? [];
  const baseline = profile?.baseline;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Reading your ratings...</Text>
          </View>
        ) : insights.length > 0 ? (
          <>
            <Text style={styles.title}>The app already knows you</Text>
            <Text style={styles.subtitle}>
              Built from your ratings and follows. It sharpens with every one.
            </Text>
            <ScrollView
              style={styles.cards}
              contentContainerStyle={styles.cardsContent}
              showsVerticalScrollIndicator={false}
            >
              {insights.map((insight) => (
                <View key={insight.key} style={styles.card}>
                  <Text style={styles.cardHeadline}>{insight.headline}</Text>
                  <Text style={styles.cardSubline}>{insight.subline}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        ) : (
          <View style={styles.centerFill}>
            <FontAwesome name="line-chart" size={56} color={colors.primary} />
            <Text style={styles.title2}>Your profile is forming</Text>
            <Text style={styles.formingBody}>
              Every rating sharpens it. Keep rating and the app will start
              telling you things about yourself.
            </Text>
            {baseline && baseline.count > 0 ? (
              <Text style={styles.formingStats}>
                {baseline.count} {baseline.count === 1 ? 'fight' : 'fights'} rated
                {' · '}averaging {baseline.avg.toFixed(1)}
              </Text>
            ) : null}
          </View>
        )}

        <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Get into the fights</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  title2: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  cards: {
    flex: 1,
  },
  cardsContent: {
    paddingBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 12,
  },
  cardHeadline: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    lineHeight: 24,
  },
  cardSubline: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  formingBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  formingStats: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  continueButtonText: {
    fontSize: 16,
    color: colors.textOnAccent,
    fontWeight: '600',
  },
});
