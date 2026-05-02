import React from 'react';
import { Image, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';

interface ReviewPromptModalProps {
  visible: boolean;
  onRateNow: () => void;
  onMaybeLater: () => void;
}

export const ReviewPromptModal: React.FC<ReviewPromptModalProps> = ({
  visible,
  onRateNow,
  onMaybeLater,
}) => {
  const colors = Colors.dark;
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Play Store';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onMaybeLater}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.card }]}>
          <View style={styles.iconContainer}>
            <Image
              source={require('../assets/app-icon-internal.png')}
              style={styles.appIcon}
              resizeMode="contain"
            />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Enjoying Good Fights?
          </Text>

          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Leave a quick rating on the {storeName} — it helps other fight fans find the app.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={onRateNow}
          >
            <Text style={[styles.primaryButtonText, { color: colors.textOnAccent }]}>
              Rate on {storeName}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.background }]}
            onPress={onMaybeLater}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Maybe Later
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 16,
  },
  appIcon: {
    width: 72,
    height: 72,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ReviewPromptModal;
