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
import HypeDistributionChart from './HypeDistributionChart';

// NOTE: this component is rendered INSIDE UpcomingFightModal's <Modal> tree,
// not as its own <Modal>. That guarantees both the hype container and the
// reveal container share the exact same parent View (flex:1 overlay), so
// `width: '88%'` resolves to identical pixels for both. Two stacked native
// Modals were producing slightly different computed widths.

interface HypeRevealOverlayProps {
  visible: boolean;
  onClose: () => void;
  distribution: Record<number, number>;
  totalPredictions: number;
  averageHype: number;
  userHype: number;
  // Prefetched Fan DNA beat — the rate/hype mutation endpoint includes the
  // evaluated line in its response (same roundtrip as the commit), so by the
  // time the modal opens this is in state. Null = engine had nothing to say.
  dnaLine?: string | null;
}

function getComparisonText(userHype: number, avgHype: number, totalPredictions: number): string {
  // First hyper (or only hyper): no community baseline — comparing them to an
  // imaginary "average fan" is misleading. Trailblazer language only.
  if (totalPredictions <= 1 || !avgHype) {
    return 'First to hype this fight';
  }
  const delta = userHype - avgHype;
  if (delta >= 2.5) return "You're much more hyped than the average fan";
  if (delta >= 1) return "You're more hyped than the average fan";
  if (delta > -1) return "You're as hyped as the average fan";
  if (delta > -2.5) return "You're less hyped than the average fan";
  return "You're much less hyped than the average fan";
}

export default function HypeRevealModal({
  visible,
  onClose,
  distribution,
  totalPredictions,
  averageHype,
  userHype,
  dnaLine,
}: HypeRevealOverlayProps) {
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

      // Animate the DNA beat in just after the chart starts. Because the line
      // arrives prefetched (inline with the rate/hype commit response), this
      // fires alongside the chart rather than after a separate roundtrip.
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
      {/* Same KAV + modalContainer + scrollContent primitives as the hype
          modal so the two stacks compute identical widths. */}
      <View style={styles.kavContainer} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.scrollContent}>
            <Text style={[styles.header, { color: colors.text }]}>Hype submitted!</Text>

            <HypeDistributionChart
              distribution={distribution}
              totalPredictions={totalPredictions}
              hasRevealedHype={true}
              fadeAnim={chartFadeAnim}
              userHype={userHype}
            />

            <Text style={[styles.comparison, { color: colors.text }]}>
              {getComparisonText(userHype, averageHype, totalPredictions)}
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

// All sizing primitives copy UpcomingFightModal's overlay / kavContainer /
// modalContainer / scrollContent verbatim. No extra horizontal constraints
// or alignSelf overrides that could fight Yoga's '88%' calculation.
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
  // Fan DNA third beat — quieter than the community-comparison line above so
  // the eye reads: bold community fact → softer personal observation.
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
  // Match Done button's pill shape and primary color; sized via paddingHorizontal
  // rather than alignSelf:stretch so it can't compete with the chart for the
  // modal's cross-axis width.
  closeButton: {
    marginTop: 24,
    marginHorizontal: 36,
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
