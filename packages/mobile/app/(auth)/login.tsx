import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
  KeyboardEvent,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../store/AuthContext';
import { getBiometricLabel } from '../../utils/biometricAuth';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { AppleSignInButton } from '../../components/AppleSignInButton';

const BIOMETRIC_PROMPT_DISMISSED_KEY = 'biometricPromptDismissed';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const {
    login,
    continueAsGuest,
    biometricAvailable,
    biometricEnabled,
    loginWithBiometric,
    enableBiometricLogin,
  } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const canQuickUnlock = biometricAvailable && biometricEnabled;

  // Handle keyboard show/hide
  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event: KeyboardEvent) => {
        setKeyboardHeight(event.endCoordinates.height);
      }
    );

    const keyboardHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardShowListener?.remove();
      keyboardHideListener?.remove();
    };
  }, []);

  // Resolve the device's biometric label (Face ID / Touch ID / Fingerprint) for
  // button + prompt copy, and auto-trigger the unlock prompt once if it's set up
  // so a returning (or just-logged-out) user can tap straight back in.
  const autoPrompted = React.useRef(false);
  useEffect(() => {
    if (!canQuickUnlock) return;
    let cancelled = false;
    (async () => {
      const label = await getBiometricLabel();
      if (cancelled) return;
      setBiometricLabel(label);
      if (!autoPrompted.current) {
        autoPrompted.current = true;
        handleBiometricLogin();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canQuickUnlock]);

  const handleBiometricLogin = async () => {
    setIsLoading(true);
    setStatus('');
    try {
      await loginWithBiometric();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      // A cancelled scan is a normal user action — don't shout about it.
      if (message !== 'Authentication cancelled') {
        setStatus(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // After a successful manual login, offer to turn on quick-unlock — unless it's
  // already on or the user has dismissed the offer before.
  const maybeOfferBiometric = async (loginEmail: string, loginPassword: string) => {
    if (!biometricAvailable || biometricEnabled) return;
    const dismissed = await AsyncStorage.getItem(BIOMETRIC_PROMPT_DISMISSED_KEY);
    if (dismissed === 'true') return;
    const label = await getBiometricLabel();
    Alert.alert(
      `Sign in faster with ${label}?`,
      `Next time, unlock Good Fights with ${label} instead of typing your password.`,
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => AsyncStorage.setItem(BIOMETRIC_PROMPT_DISMISSED_KEY, 'true'),
        },
        {
          text: `Use ${label}`,
          onPress: () => enableBiometricLogin(loginEmail, loginPassword),
        },
      ]
    );
  };

  const handleLogin = async () => {
    setStatus('Button clicked!');

    if (!email.trim()) {
      setStatus('Please enter your email');
      return;
    }

    setIsLoading(true);
    setStatus('Logging in...');

    const normalizedEmail = email.trim().toLowerCase();
    try {
      await login(normalizedEmail, password);
      setStatus('Login successful!');
      // login() has already navigated to the tabs; this alert overlays it.
      maybeOfferBiometric(normalizedEmail, password);
    } catch (error) {
      setStatus(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.content, { marginBottom: keyboardHeight }]}>
          <View style={styles.header}>
            <Image source={require('../../assets/login-logo.png')} style={styles.logoImage} resizeMode="contain" />
          </View>

        {/* Biometric quick-unlock — only when set up on this device */}
        {canQuickUnlock && (
          <TouchableOpacity
            style={[styles.biometricButton, { borderColor: colors.primary }]}
            onPress={handleBiometricLogin}
            disabled={isLoading}
          >
            <Ionicons
              name={biometricLabel === 'Face ID' || biometricLabel === 'Face Unlock' ? 'scan-outline' : 'finger-print'}
              size={22}
              color={colors.primary}
            />
            <Text style={[styles.biometricButtonText, { color: colors.primary }]}>
              Unlock with {biometricLabel}
            </Text>
          </TouchableOpacity>
        )}

        {/* OAuth Sign-In Buttons */}
        <View style={styles.oauthContainer}>
          <AppleSignInButton
            mode="signin"
            onError={(err) => setStatus(`Apple sign-in failed: ${err}`)}
          />
          <GoogleSignInButton
            mode="signin"
            onError={(err) => setStatus(`Google sign-in failed: ${err}`)}
          />
        </View>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or sign in with email</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Status Display */}
        {status ? (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.showPasswordButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.showPasswordText}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => router.push('/(auth)/forgot-password')}
            >
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={[styles.buttonText, { color: colors.textOnAccent }]}>
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Text>
          </TouchableOpacity>

        </View>

        {/* Sign Up Link */}
        <TouchableOpacity
          style={styles.signUpLink}
          onPress={() => router.push('/register')}
        >
          <Text style={styles.signUpText}>
            New? <Text style={[styles.signUpLinkText, { color: colors.tint }]}>Sign Up</Text>
          </Text>
        </TouchableOpacity>

        {/* Continue as Guest */}
        <TouchableOpacity
          style={styles.guestButton}
          onPress={continueAsGuest}
        >
          <Text style={styles.guestButtonText}>Continue as Guest</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 320,
    height: 200,
    marginBottom: 16,
  },
  statusContainer: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: colors.text,
  },
  showPasswordButton: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  showPasswordText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  signUpLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  signUpLinkText: {
    fontWeight: '600',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 14,
    marginBottom: 16,
  },
  biometricButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  oauthContainer: {
    marginBottom: 16,
    gap: 12,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  guestButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  guestButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});