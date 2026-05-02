import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';

interface SpoilerOnboardingModalProps {
  visible: boolean;
  onShowResults: () => void;
  onHideResults: () => void;
}

export const SpoilerOnboardingModal: React.FC<SpoilerOnboardingModalProps> = ({
  visible,
  onShowResults,
  onHideResults,
}) => {
  const colors = Colors.dark;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            Avoiding spoilers?
          </Text>

          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Good Fights can hide winners, methods, and ratings until after you've watched a fight.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={onHideResults}
          >
            <Text style={[styles.primaryButtonText, { color: colors.textOnAccent }]}>
              Hide Results (Spoiler-Free)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.background }]}
            onPress={onShowResults}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Show Results
            </Text>
          </TouchableOpacity>

          <Text style={[styles.footer, { color: colors.textSecondary }]}>
            You can change this anytime on the Profile tab.
          </Text>
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
    marginBottom: 20,
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
    marginBottom: 16,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});

export default SpoilerOnboardingModal;
