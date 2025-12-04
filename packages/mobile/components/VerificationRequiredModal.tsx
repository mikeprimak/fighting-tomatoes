import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useAuth } from '../store/AuthContext';
import { api } from '../services/api';

interface VerificationRequiredModalProps {
  visible: boolean;
  onClose: () => void;
  actionDescription?: string;
}

export const VerificationRequiredModal: React.FC<VerificationRequiredModalProps> = ({
  visible,
  onClose,
  actionDescription = 'perform this action',
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();

  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleResend = async () => {
    if (isResending || !user?.email) return;

    setIsResending(true);
    setResendStatus('idle');

    try {
      await api.resendVerificationEmail(user.email);
      setResendStatus('success');
      setTimeout(() => setResendStatus('idle'), 3000);
    } catch (error) {
      console.error('Error resending verification email:', error);
      setResendStatus('error');
      setTimeout(() => setResendStatus('idle'), 3000);
    } finally {
      setIsResending(false);
    }
  };

  const getResendButtonText = () => {
    if (isResending) return 'Sending...';
    if (resendStatus === 'success') return 'Email Sent!';
    if (resendStatus === 'error') return 'Failed - Try Again';
    return 'Resend Verification Email';
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.card }]}>
          <View style={styles.iconContainer}>
            <FontAwesome name="envelope" size={48} color="#d32f2f" />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Email Verification Required
          </Text>

          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Please verify your email address to {actionDescription}. Check your inbox for the verification link.
          </Text>

          <TouchableOpacity
            style={[
              styles.resendButton,
              resendStatus === 'success' && styles.resendButtonSuccess,
              resendStatus === 'error' && styles.resendButtonError,
            ]}
            onPress={handleResend}
            disabled={isResending}
          >
            {isResending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <FontAwesome
                  name={resendStatus === 'success' ? 'check' : resendStatus === 'error' ? 'times' : 'envelope'}
                  size={16}
                  color="#fff"
                  style={styles.buttonIcon}
                />
                <Text style={styles.resendButtonText}>{getResendButtonText()}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: colors.background }]}
            onPress={onClose}
          >
            <Text style={[styles.closeButtonText, { color: colors.text }]}>
              Close
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
  resendButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  resendButtonSuccess: {
    backgroundColor: '#166534',
  },
  resendButtonError: {
    backgroundColor: '#991b1b',
  },
  buttonIcon: {
    marginRight: 8,
  },
  resendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default VerificationRequiredModal;
