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
import ShareableFightCard, { ShareCardFight } from './ShareableFightCard';
import { shareFightLink } from '../utils/shareFightCard';

// Rendered INSIDE CompletedFightModal's <Modal> tree (not as its own <Modal>)
// so the reveal container shares the same parent overlay View — `width: '88%'`
// resolves to identical pixels. Mirrors HypeRevealModal exactly.

interface RatingRevealOverlayProps {
  visible: boolean;
  onClose: () => void;
  fight: ShareCardFight;
  userRating: number;
}

export default function RatingRevealModal({
  visible,
  onClose,
  fight,
  userRating,
}: RatingRevealOverlayProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Ref on the branded card — the future capture step (react-native-view-shot)
  // will snapshot exactly this view to a PNG for the native share sheet.
  const cardRef = useRef<View>(null);

  const overlayFadeAnim = useRef(new Animated.Value(0)).current;

  // Open animation — fade the whole overlay in once per visible→true transition.
  useEffect(() => {
    if (visible) {
      overlayFadeAnim.setValue(0);
      Animated.timing(overlayFadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, overlayFadeAnim]);

  const [sharing, setSharing] = useState(false);
  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareFightLink({ fight, variant: 'rating', value: userRating });
    } finally {
      setSharing(false);
    }
  };

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
            {/* Branded, shareable card — the hero of the reveal */}
            <ShareableFightCard ref={cardRef} variant="rating" fight={fight} value={userRating} />

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
