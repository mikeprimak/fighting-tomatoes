import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { API_BASE_URL } from '../../services/api';
import { useAuth } from '../../store/AuthContext';

export default function VerifyEmailSuccessScreen() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const params = useLocalSearchParams<{ token?: string }>();
  const { refreshUserData } = useAuth();

  useEffect(() => {
    verifyEmail();
  }, []);

  const verifyEmail = async () => {
    const token = params.token;

    if (!token) {
      setStatus('error');
      setErrorMessage('Invalid verification link. Please request a new one.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-email?token=${token}`);
      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        // Refresh user data to update isEmailVerified
        await refreshUserData();
        // Auto-navigate to main app after 3 seconds
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 3000);
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Verification failed. The link may have expired.');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage('Network error. Please try again.');
    }
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Verifying your email...</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <View style={styles.iconContainer}>
              <View style={styles.successCircle}>
                <FontAwesome name="check" size={60} color="#fff" />
              </View>
            </View>
            <Text style={styles.title}>Email Verified!</Text>
            <Text style={styles.description}>
              Your email has been successfully verified. You now have access to all features.
            </Text>
            <Text style={styles.redirectText}>
              Redirecting to app...
            </Text>
          </>
        )}

        {status === 'error' && (
          <>
            <View style={styles.iconContainer}>
              <View style={styles.errorCircle}>
                <FontAwesome name="times" size={60} color="#fff" />
              </View>
            </View>
            <Text style={styles.title}>Verification Failed</Text>
            <Text style={styles.description}>{errorMessage}</Text>
            <Text
              style={styles.linkText}
              onPress={() => router.replace('/(auth)/login')}
            >
              Back to Sign In
            </Text>
          </>
        )}
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
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 24,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 16,
  },
  redirectText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  linkText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 16,
  },
});
