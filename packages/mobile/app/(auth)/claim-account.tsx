import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { API_BASE_URL } from '../../services/api';

export default function ClaimAccountScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email || '';

  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState('');
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handleSendEmail = async () => {
    if (!email) {
      setError('Email address is missing. Please try logging in again.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/claim-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.toLowerCase() }),
      });

      if (response.ok) {
        setIsSent(true);
      } else {
        const data = await response.json();
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const styles = createStyles(colors);

  if (isSent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <View style={styles.successCircle}>
              <FontAwesome name="envelope" size={50} color="#fff" />
            </View>
          </View>
          <Text style={styles.title}>Check Your Email</Text>
          <Text style={styles.description}>
            We've sent an email to <Text style={styles.emailHighlight}>{email}</Text> with a link to set up your new password.
          </Text>
          <Text style={styles.tip}>
            Don't see the email? Check your spam folder.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={styles.primaryButtonText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <FontAwesome name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>

        {/* Icon */}
        <View style={styles.iconContainer}>
          <FontAwesome name="refresh" size={60} color={colors.primary} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Welcome Back!</Text>

        {/* Migration Message */}
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>
            Your account from <Text style={styles.bold}>fightingtomatoes.com</Text> has been transferred to the new <Text style={styles.bold}>Good Fights</Text> app.
          </Text>
          <Text style={[styles.messageText, { marginTop: 12 }]}>
            All your ratings, reviews, and history are preserved. To access your account, you just need to set a new password.
          </Text>
        </View>

        {/* Email Display */}
        <View style={styles.emailContainer}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.emailBox}>
            <FontAwesome name="envelope-o" size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
            <Text style={styles.emailText}>{email}</Text>
          </View>
        </View>

        {/* Error Message */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Send Email Button */}
        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleSendEmail}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <Text style={styles.primaryButtonText}>Send Verification Email</Text>
          )}
        </TouchableOpacity>

        {/* Alternative: Use Google */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.alternativeText}>
          You can also sign in with Google to instantly access your account.
        </Text>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.secondaryButtonText}>Back to Sign In</Text>
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
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 8,
    zIndex: 1,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  messageBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    textAlign: 'center',
  },
  bold: {
    fontWeight: '600',
  },
  emailContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    backgroundColor: colors.card,
  },
  emailText: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  emailHighlight: {
    fontWeight: '600',
    color: colors.primary,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  tip: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    fontStyle: 'italic',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textOnAccent,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: colors.textSecondary,
  },
  alternativeText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  secondaryButton: {
    padding: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
