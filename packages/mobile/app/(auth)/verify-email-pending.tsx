import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthContext';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { API_BASE_URL } from '../../services/api';

export default function VerifyEmailPendingScreen() {
  const { user } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [message, setMessage] = useState('');
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const params = useLocalSearchParams<{ email?: string }>();

  const displayEmail = params.email || user?.email || '';

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    if (resendCooldown > 0 || !displayEmail) return;

    setIsResending(true);
    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: displayEmail }),
      });

      if (response.ok) {
        setMessage('Verification email sent! Check your inbox.');
        setResendCooldown(60); // 60 second cooldown
      } else {
        setMessage('Failed to send email. Please try again.');
      }
    } catch (error) {
      setMessage('Network error. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const handleSkipForNow = () => {
    router.replace('/(tabs)');
  };

  const handleBackToLogin = () => {
    router.replace('/(auth)/login');
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <FontAwesome name="envelope" size={80} color={colors.primary} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Check Your Email</Text>

        {/* Description */}
        <Text style={styles.description}>
          We've sent a verification link to:
        </Text>
        <Text style={styles.email}>{displayEmail}</Text>

        <Text style={styles.instructions}>
          Click the link in the email to verify your account and unlock all features.
        </Text>

        {/* Message */}
        {message ? (
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        ) : null}

        {/* Resend Button */}
        <TouchableOpacity
          style={[
            styles.resendButton,
            (isResending || resendCooldown > 0) && styles.buttonDisabled
          ]}
          onPress={handleResendEmail}
          disabled={isResending || resendCooldown > 0}
        >
          {isResending ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.resendButtonText}>
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Didn't receive it? Resend Email"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Skip Button */}
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkipForNow}
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>

        {/* Back to Login */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackToLogin}
        >
          <Text style={styles.backButtonText}>
            Back to Sign In
          </Text>
        </TouchableOpacity>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 24,
  },
  instructions: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  messageContainer: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    color: colors.text,
    fontSize: 14,
    textAlign: 'center',
  },
  resendButton: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  resendButtonText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  skipButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  skipButtonText: {
    fontSize: 16,
    color: colors.textOnAccent,
    fontWeight: '600',
  },
  backButton: {
    padding: 12,
  },
  backButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
