import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useColorScheme,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import HypeDistributionChart from './HypeDistributionChart';
import ShareableFightCard, { ShareCardFight } from './ShareableFightCard';
import { shareFightLink } from '../utils/shareFightCard';

// NOTE: this component is rendered INSIDE UpcomingFightModal's <Modal> tree,
// not as its own <Modal>. That guarantees both the hype container and the
// reveal container share the exact same parent View (flex:1 overlay), so
// `width: '88%'` resolves to identical pixels for both. Two stacked native
// Modals were producing slightly different computed widths.

interface HypeRevealOverlayProps {
  visible: boolean;
  onClose: () => void;
  fight: ShareCardFight;
  distribution: Record<number, number>;
  totalPredictions: number;
  userHype: number;
}

export default function HypeRevealModal({
  visible,
  onClose,
  fight,
  distribution,
  totalPredictions,
  userHype,
}: HypeRevealOverlayProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Ref on the branded card — the future capture step (react-native-view-shot)
  // will snapshot exactly this view to a PNG for the native share sheet.
  const cardRef = useRef<View>(null);

  const chartFadeAnim = useRef(new Animated.Value(0)).current;
  const overlayFadeAnim = useRef(new Animated.Value(0)).current;

  // Open animation — overlay + chart. Runs exactly once per visible→true
  // transition.
  useEffect(() => {
    if (visible) {
      chartFadeAnim.setValue(0);
      overlayFadeAnim.setValue(0);
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
    }
  }, [visible, chartFadeAnim, overlayFadeAnim]);

  const [sharing, setSharing] = useState(false);
  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareFightLink({ fight, variant: 'hype', value: userHype });
    } finally {
      setSharing(false);
    }
  };

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
            {/* Branded, shareable card — the hero of the reveal */}
            <ShareableFightCard ref={cardRef} variant="hype" fight={fight} value={userHype} />

            {/* Community distribution — in-app context, not part of the shared card */}
            <View style={styles.chartWrap}>
              <HypeDistributionChart
                distribution={distribution}
                totalPredictions={totalPredictions}
                hasRevealedHype={true}
                fadeAnim={chartFadeAnim}
                userHype={userHype}
              />
            </View>

            <TouchableOpacity
              style={[styles.shareButton, { backgroundColor: colors.primary }]}
              onPress={handleShare}
              activeOpacity={0.85}
              disabled={sharing}
            >
              <FontAwesome name="share" size={15} color="#000" style={styles.shareIcon} />
              <Text style={styles.shareText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.closeText, { color: colors.textSecondary }]}>Close</Text>
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
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  chartWrap: {
    width: '100%',
    marginTop: 22,
  },
  shareButton: {
    flexDirection: 'row',
    marginTop: 24,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  shareIcon: {
    marginRight: 8,
  },
  shareText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  closeButton: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
