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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../store/AuthContext';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { login } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

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

  const handleLogin = async () => {
    setStatus('Button clicked!');

    if (!email.trim() || !password.trim()) {
      setStatus('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setStatus('Logging in...');

    try {
      await login(email.trim().toLowerCase(), password);
      setStatus('Login successful!');
    } catch (error) {
      setStatus(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fillTestCredentials = () => {
    setEmail('test@fightingtomatoes.com');
    setPassword('password123');
    setStatus('Test credentials filled');
  };

  const fillDerpCredentials = () => {
    setEmail('derp@fightingtomatoes.com');
    setPassword('password123');
    setStatus('Derp credentials filled');
  };


  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.content, { marginBottom: keyboardHeight }]}>
        <View style={styles.header}>
          <Text style={styles.title}>🥊</Text>
          <Text style={styles.subtitle}>FightCrewApp</Text>
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
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
            />
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

          {/* Development Login Buttons */}
          <TouchableOpacity
            style={styles.devButton}
            onPress={fillTestCredentials}
          >
            <Text style={styles.devButtonText}>
              🧪 Fill Test Credentials (Dev)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.devButton}
            onPress={fillDerpCredentials}
          >
            <Text style={styles.devButtonText}>
              🧪 Fill Derp Credentials (Dev)
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
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 64,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
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
  devButton: {
    backgroundColor: colors.textSecondary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  devButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
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
});