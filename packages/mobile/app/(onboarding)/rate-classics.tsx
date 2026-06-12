/**
 * Onboarding step 2 — rate a fast stack of classics.
 *
 * One fight at a time, using the SAME rating visual as RateFightModal (Mike,
 * 2026-06-12): ten tappable stars + the large star with the rolling number
 * wheel. A tap scrolls the big number, lands, then auto-advances to the next
 * fight. "Haven't seen it" skips. Ratings fire-and-forget via the existing
 * rate endpoint (no email-verification gate — onboarding runs before the
 * user verifies); failures are silent and the payoff screen's empty state
 * covers the zero-data case.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { apiService, OnboardingStackFight } from '../../services/api';

// 10, not 30 — Mike's own walk (2026-06-12) lost interest at fight 11. The
// profile keeps sharpening in-app; onboarding only needs a real start.
const STACK_SIZE = 10;

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
  const [rating, setRating] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Same wheel mechanics as RateFightModal: 1200 = blank, (10 - n) * 120 = n.
  const wheelAnimation = useRef(new Animated.Value(1200)).current;
  const starColorAnimation = useRef(new Animated.Value(0)).current;
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiService
      .getOnboardingRateStack(STACK_SIZE)
      .then((res) => setFights(res.fights))
      .catch(() => setFights([]))
      .finally(() => setIsLoading(false));
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  const fight = fights[index];
  const done = !isLoading && (!fight || index >= fights.length);

  const advance = () => {
    wheelAnimation.setValue(1200);
    starColorAnimation.setValue(0);
    setRating(0);
    setIsAnimating(false);
    setIndex((i) => i + 1);
  };

  const handleRate = (level: number) => {
    if (!fight || isAnimating) return;
    setIsAnimating(true);
    setRating(level);
    // Fire-and-forget; failures silent.
    apiService.rateFight(fight.fightId, level).catch(() => {});
    setRatedCount((c) => c + 1);

    Animated.timing(starColorAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
    // Scroll the big number, let it land, dwell a beat, then next fight.
    Animated.timing(wheelAnimation, {
      toValue: (10 - level) * 120,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      advanceTimer.current = setTimeout(advance, 350);
    });
  };

  const handleSkipFight = () => {
    if (isAnimating) return;
    advance();
  };

  const handleContinue = () => {
    // Follows come BEFORE the payoff screen so they feed the taste profile.
    router.push('/(onboarding)/follow-fighters');
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
                ? 'Next: pick the fighters you never want to miss.'
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

            {/* Same visual as RateFightModal: big star + rolling number wheel */}
            <View style={styles.displayStarContainer}>
              <View style={styles.animatedStarContainer}>
                <View style={{ position: 'relative', marginTop: 24 }}>
                  <FontAwesome name="star" size={80} color="#666666" />
                  <Animated.View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      opacity: starColorAnimation,
                    }}
                  >
                    <FontAwesome name="star" size={80} color={colors.primary} />
                  </Animated.View>
                </View>
                <View style={styles.wheelContainer}>
                  <Animated.View
                    style={[
                      styles.wheelNumbers,
                      {
                        transform: [{
                          translateY: wheelAnimation.interpolate({
                            inputRange: [0, 1200],
                            outputRange: [475, -725],
                          }),
                        }],
                      },
                    ]}
                  >
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((number) => (
                      <Text key={number} style={[styles.wheelNumber, { color: colors.text }]}>
                        {number}
                      </Text>
                    ))}
                  </Animated.View>
                  <LinearGradient
                    colors={[colors.card, `${colors.card}DD`, `${colors.card}99`, `${colors.card}44`, 'transparent']}
                    style={[styles.fadeOverlay, { top: 0, height: 38 }]}
                    pointerEvents="none"
                  />
                  <LinearGradient
                    colors={['transparent', `${colors.card}44`, `${colors.card}99`, `${colors.card}DD`, colors.card, colors.card]}
                    style={[styles.fadeOverlay, { bottom: -12, height: 25 }]}
                    pointerEvents="none"
                  />
                </View>
              </View>
            </View>

            <View style={styles.starContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <TouchableOpacity
                  key={level}
                  onPress={() => handleRate(level)}
                  style={styles.starButton}
                  disabled={isAnimating}
                >
                  <FontAwesome
                    name="star"
                    size={28}
                    color={level <= rating ? colors.primary : '#666666'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.skipFightButton} onPress={handleSkipFight}>
              <Text style={styles.skipFightText}>Haven't seen it</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          {!done ? (
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
  // Star wheel — geometry copied from RateFightModal so the visuals match.
  displayStarContainer: {
    alignItems: 'center',
    marginBottom: 12,
    marginTop: -16,
  },
  animatedStarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 4,
  },
  wheelContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  wheelNumbers: {
    alignItems: 'center',
    paddingTop: 150,
  },
  wheelNumber: {
    fontSize: 52,
    fontWeight: 'bold',
    height: 120,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 120,
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    minWidth: 120,
  },
  fadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  starButton: {
    padding: 3,
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
