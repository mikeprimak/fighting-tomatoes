import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useColorScheme,
} from 'react-native';
import { Colors } from '../constants/Colors';
import RatingDistributionChart from './RatingDistributionChart';

// Rendered INSIDE CompletedFightModal's <Modal> tree (not as its own <Modal>)
// so both modalContainers share the same parent overlay View — `width: '88%'`
// resolves to identical pixels on both. Mirrors HypeRevealModal exactly.

interface RatingRevealOverlayProps {
  visible: boolean;
  onClose: () => void;
  distribution: Record<number, number>;
  totalRatings: number;
  averageRating: number;
  userRating: number;
  // Prefetched Fan DNA beat from the rate mutation response (same roundtrip
  // as the commit). Null = engine had nothing to say.
  dnaLine?: string | null;
}

function getComparisonText(userRating: number, avgRating: number): string {
  if (!avgRating) return '';
  const delta = userRating - avgRating;
  if (delta >= 2.5) return 'You rated this much higher than the average fan';
  if (delta >= 1) return 'You rated this higher than the average fan';
  if (delta > -1) return 'You rated this about the same as the average fan';
  if (delta > -2.5) return 'You rated this lower than the average fan';
  return 'You rated this much lower than the average fan';
}

export default function RatingRevealModal({
  visible,
  onClose,
  distribution,
  totalRatings,
  averageRating,
  userRating,
  dnaLine,
}: RatingRevealOverlayProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const chartFadeAnim = useRef(new Animated.Value(0)).current;
  const overlayFadeAnim = useRef(new Animated.Value(0)).current;
  const dnaFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      chartFadeAnim.setValue(0);
      overlayFadeAnim.setValue(0);
      dnaFadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(overlayFadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(chartFadeAnim, {
          toValue: 1,
          duration: 380,
          delay: 120,
          useNativeDriver: true,
        }),
      ]).start();

      // Line arrives prefetched from the rate mutation response, so this
      // fires alongside the chart animation instead of after a roundtrip.
      if (dnaLine) {
        Animated.timing(dnaFadeAnim, {
          toValue: 1,
          duration: 420,
          delay: 280,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [visible, chartFadeAnim, overlayFadeAnim, dnaFadeAnim, dnaLine]);

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: overlayFadeAnim }]} pointerEvents="auto">
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={styles.kavContainer} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.scrollContent}>
            <Text style={[styles.header, { color: colors.text }]}>Rating submitted!</Text>

            <RatingDistributionChart
              distribution={distribution}
              totalRatings={totalRatings}
              userRating={userRating}
              fadeAnim={chartFadeAnim}
            />

            <Text style={[styles.comparison, { color: colors.text }]}>
              {getComparisonText(userRating, averageRating)}
            </Text>

            {dnaLine ? (
              <Animated.Text
                style={[styles.dnaLine, { color: colors.text, opacity: dnaFadeAnim }]}
              >
                {dnaLine}
              </Animated.Text>
            ) : null}

            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: colors.primary }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kavContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalContainer: {
    width: '88%',
    borderRadius: 20,
    maxHeight: '90%',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 28,
    paddingBottom: 16,
    alignItems: 'center',
  },
  header: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    opacity: 0.7,
    marginBottom: 20,
  },
  comparison: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 18,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  // Fan DNA third beat — italicized + dimmed so it reads as personal
  // observation under the bolder community-comparison line.
  dnaLine: {
    fontSize: 13.5,
    fontStyle: 'italic',
    fontWeight: '500',
    marginTop: 12,
    paddingHorizontal: 8,
    textAlign: 'center',
    opacity: 0.78,
    letterSpacing: 0.15,
    lineHeight: 19,
  },
  // Matches Done button width on the rating modal: bottomRow has 8pt padding
  // each side, so marginHorizontal: (8) here. There's no notify bell on the
  // rating modal, so we don't subtract for one.
  closeButton: {
    marginTop: 24,
    marginHorizontal: 8,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
});
