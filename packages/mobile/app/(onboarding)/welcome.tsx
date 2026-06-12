/**
 * Onboarding step 1 — the thesis in one screen.
 *
 * "Good Fights learns what kind of fight fan you are." Three beats, one CTA
 * into the rate-classics stack. No skip — onboarding is mandatory (Mike,
 * 2026-06-12); the flow itself is short enough to not need an exit.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

export default function OnboardingWelcomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const styles = createStyles(colors);

  const handleStart = () => {
    router.push('/(onboarding)/rate-classics');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../../assets/login-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>
          Good Fights learns what kind of fight fan you are
        </Text>

        <View style={styles.beats}>
          <View style={styles.beat}>
            <View style={styles.beatIcon}>
              <FontAwesome name="star" size={22} color={colors.primary} />
            </View>
            <View style={styles.beatTextWrap}>
              <Text style={styles.beatTitle}>Rate fights</Text>
              <Text style={styles.beatBody}>
                Every rating builds your taste profile — wars, knockouts,
                grudge matches, whatever you love.
              </Text>
            </View>
          </View>

          <View style={styles.beat}>
            <View style={styles.beatIcon}>
              <FontAwesome name="user-plus" size={22} color={colors.primary} />
            </View>
            <View style={styles.beatTextWrap}>
              <Text style={styles.beatTitle}>Follow fighters</Text>
              <Text style={styles.beatBody}>
                We'll tell you when they're booked and when they walk —
                never miss them again.
              </Text>
            </View>
          </View>

          <View style={styles.beat}>
            <View style={styles.beatIcon}>
              <FontAwesome name="line-chart" size={22} color={colors.primary} />
            </View>
            <View style={styles.beatTextWrap}>
              <Text style={styles.beatTitle}>The app pays it back</Text>
              <Text style={styles.beatBody}>
                Insights about the fan you are — just for you, sharper with
                every rating.
              </Text>
            </View>
          </View>

          <View style={styles.beat}>
            <View style={styles.beatIcon}>
              <FontAwesome name="book" size={22} color={colors.primary} />
            </View>
            <View style={styles.beatTextWrap}>
              <Text style={styles.beatTitle}>Your fight diary</Text>
              <Text style={styles.beatBody}>
                A running record of your fandom — every fight you've watched
                and what you thought of it, kept for good.
              </Text>
            </View>
          </View>

          <View style={styles.beat}>
            <View style={styles.beatIcon}>
              <FontAwesome name="compass" size={22} color={colors.primary} />
            </View>
            <View style={styles.beatTextWrap}>
              <Text style={styles.beatTitle}>Fight recommendations</Text>
              <Text style={styles.beatBody}>
                We'll point you to upcoming fights you might love, based on
                the taste you build.
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.ctaButton} onPress={handleStart}>
          <Text style={styles.ctaButtonText}>Build my fan profile</Text>
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
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 96,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 24,
  },
  beats: {
    marginBottom: 24,
  },
  beat: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  beatIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  beatTextWrap: {
    flex: 1,
  },
  beatTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  beatBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  ctaButtonText: {
    fontSize: 16,
    color: colors.textOnAccent,
    fontWeight: '600',
  },
});
