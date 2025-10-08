import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors } from '../constants/Colors';

interface FlagReviewModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isLoading?: boolean;
  colorScheme: 'light' | 'dark';
}

const FLAG_REASONS = [
  { value: 'SPAM', label: 'Spam or promotional content', description: 'Unwanted commercial content or repetitive posts' },
  { value: 'HARASSMENT', label: 'Harassment or hate speech', description: 'Abusive, threatening, or hateful content' },
  { value: 'PRIVACY', label: 'Privacy violation', description: 'Shares private or personal information' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content', description: 'Offensive, graphic, or explicit material' },
  { value: 'MISINFORMATION', label: 'False or misleading', description: 'Contains inaccurate or deceptive information' },
  { value: 'OTHER', label: 'Other', description: 'Violates community guidelines in another way' },
];

export const FlagReviewModal: React.FC<FlagReviewModalProps> = ({
  visible,
  onClose,
  onSubmit,
  isLoading = false,
  colorScheme,
}) => {
  const colors = Colors[colorScheme];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            Report Review
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Why are you reporting this review?
          </Text>

          <ScrollView style={styles.reasonsList}>
            {FLAG_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.value}
                style={[styles.reasonItem, { borderBottomColor: colors.border }]}
                onPress={() => onSubmit(reason.value)}
                disabled={isLoading}
              >
                <Text style={[styles.reasonLabel, { color: colors.text }]}>
                  {reason.label}
                </Text>
                <Text style={[styles.reasonDescription, { color: colors.textSecondary }]}>
                  {reason.description}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: colors.background }]}
            onPress={onClose}
            disabled={isLoading}
          >
            <Text style={[styles.cancelButtonText, { color: colors.text }]}>
              Cancel
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  reasonsList: {
    maxHeight: 400,
  },
  reasonItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  reasonLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  reasonDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  cancelButton: {
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
