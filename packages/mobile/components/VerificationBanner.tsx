import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/AuthContext';
import { Colors } from '../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';
import { api } from '../services/api';

interface VerificationBannerProps {
  onDismiss?: () => void;
}

export function VerificationBanner({ onDismiss }: VerificationBannerProps) {
  const { user, refreshUserData } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for verification status every 5 seconds while banner is visible
  useEffect(() => {
    if (user && !user.isEmailVerified) {
      pollingRef.current = setInterval(() => {
        refreshUserData?.();
      }, 5000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [user?.isEmailVerified, refreshUserData]);

  // Don't show if user is verified or not logged in
  if (!user || user.isEmailVerified) {
    return null;
  }

  const handleResend = async () => {
    if (isResending || !user?.email) return;

    setIsResending(true);
    setResendStatus('idle');

    try {
      await api.resendVerificationEmail(user.email);
      setResendStatus('success');
      // Reset to idle after 3 seconds
      setTimeout(() => setResendStatus('idle'), 3000);
    } catch (error) {
      console.error('Error resending verification email:', error);
      setResendStatus('error');
      // Reset to idle after 3 seconds
      setTimeout(() => setResendStatus('idle'), 3000);
    } finally {
      setIsResending(false);
    }
  };

  const styles = createStyles(colors);

  const getStatusText = () => {
    if (resendStatus === 'success') return 'Email sent! Check your inbox.';
    if (resendStatus === 'error') return 'Failed to send. Try again.';
    return 'Verification email sent. Check your inbox.';
  };

  return (
    <View style={[styles.outerContainer, { paddingTop: insets.top }]}>
      <View style={styles.banner}>
        <View style={styles.content}>
          <FontAwesome
            name={resendStatus === 'success' ? 'check-circle' : resendStatus === 'error' ? 'times-circle' : 'envelope'}
            size={16}
            color="#fff"
          />
          <Text style={styles.text}>
            {getStatusText()}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.resendButton,
            isResending && styles.resendButtonDisabled
          ]}
          onPress={handleResend}
          disabled={isResending}
        >
          {isResending ? (
            <ActivityIndicator size="small" color="#166534" />
          ) : (
            <Text style={styles.resendButtonText}>Resend</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  outerContainer: {
    backgroundColor: '#202020',
  },
  banner: {
    backgroundColor: '#166534',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
  resendButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  resendButtonDisabled: {
    opacity: 0.7,
  },
  resendButtonText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default VerificationBanner;
