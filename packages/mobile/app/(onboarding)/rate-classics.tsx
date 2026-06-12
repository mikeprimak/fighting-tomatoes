/**
 * Onboarding step 2 — rate a fast stack of classics.
 *
 * One fight at a time, quick 1-10 chip row (deliberately NOT the animated
 * wheel from RateFightModal — a fast tap row suits stack-rating better) plus
 * a "Haven't seen it" skip. Ratings fire-and-forget via the existing rate
 * endpoint (no email-verification gate — onboarding runs before the user
 * verifies); failures are silent and the payoff screen's empty state covers
 * the zero-data case.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService, OnboardingStackFight } from '../../services/api';

const ENCOURAGE_TARGET = 10;

function Headshot({ uri, colors }: { uri: string | null; colors: any }) {
  const styles = headshotStyles(colors);
  if (!uri) {
    return (
      <View style={[styles.image, styles.placeholder]}>
        <FontAwesome name="user" size={36} color={colors.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={styles.image} resizeMode="cover" />;
}

const headshotStyles = (colors: any) => StyleSheet.create({
  image: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.card,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default function RateClassicsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const styles = createStyles(colors);

  const [fights, setFights] = useState<OnboardingStackFight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [ratedCount, setRatedCount] = useState(0);

  useEffect(() => {
    apiService
      .getOnboardingRateStack(30)
      .then((res) => setFights(res.fights))
      .catch(() => setFights([]))
      .finally(() => setIsLoading(false));
  }, []);

  const fight = fights[index];
  const done = !isLoading && (!fight || index >= fights.length);

  const handleRate = (rating: number) => {
    if (!fight) return;
    // Fire-and-forget; queue failures silently.
    apiService.rateFight(fight.fightId, rating).catch(() => {});
    setRatedCount((c) => c + 1);
    setIndex((i) => i + 1);
  };

  const handleSkipFight = () => {
    setIndex((i) => i + 1);
  };

  const handleContinue = () => {
    router.push('/(onboarding)/your-profile');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Rate the classics</Text>
          <Text style={styles.headerProgress}>
            {ratedCount} rated
            {fights.length > 0 ? ` · ${Math.min(index + 1, fights.length)} of ${fights.length}` : ''}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : done ? (
          <View style={styles.centerFill}>
            <FontAwesome name="check-circle" size={56} color={colors.primary} />
            <Text style={styles.doneTitle}>
              {ratedCount > 0 ? 'Nice — that’s a real start' : 'No problem'}
            </Text>
            <Text style={styles.doneBody}>
              {ratedCount > 0
                ? 'Let’s see what your ratings say about you.'
                : 'You can rate fights anytime — your profile builds as you go.'}
            </Text>
          </View>
        ) : (
          <View style={styles.fightCard}>
            <View style={styles.fightersRow}>
              <View style={styles.fighterCol}>
                <Headshot uri={fight.fighter1.profileImage} colors={colors} />
                <Text style={styles.fighterName} numberOfLines={2}>
                  {fight.fighter1.name}
                </Text>
              </View>
              <Text style={styles.vsText}>vs</Text>
              <View style={styles.fighterCol}>
                <Headshot uri={fight.fighter2.profileImage} colors={colors} />
                <Text style={styles.fighterName} numberOfLines={2}>
                  {fight.fighter2.name}
                </Text>
              </View>
            </View>
            <Text style={styles.eventLine}>
              {[fight.eventName, fight.year].filter(Boolean).join(' · ')}
            </Text>

            <View style={styles.chipsBlock}>
              <View style={styles.chipsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={styles.chip}
                    onPress={() => handleRate(n)}
                  >
                    <Text style={styles.chipText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.chipsRow}>
                {[6, 7, 8, 9, 10].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={styles.chip}
                    onPress={() => handleRate(n)}
                  >
                    <Text style={styles.chipText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity style={styles.skipFightButton} onPress={handleSkipFight}>
              <Text style={styles.skipFightText}>Haven't seen it</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          {!done && ratedCount < ENCOURAGE_TARGET ? (
            <Text style={styles.encourageText}>
              The more you rate, the sharper your profile.
            </Text>
          ) : null}
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerProgress: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  doneBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  fightCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    justifyContent: 'center',
  },
  fightersRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 12,
  },
  fighterCol: {
    flex: 1,
    alignItems: 'center',
  },
  vsText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 38,
    marginHorizontal: 8,
  },
  fighterName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: 8,
  },
  eventLine: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  chipsBlock: {
    marginBottom: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
  },
  chip: {
    width: 52,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  chipText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  skipFightButton: {
    alignItems: 'center',
    padding: 10,
  },
  skipFightText: {
    fontSize: 14,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: 20,
  },
  encourageText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    color: colors.textOnAccent,
    fontWeight: '600',
  },
});
