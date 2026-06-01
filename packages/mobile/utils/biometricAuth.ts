// Biometric quick-unlock helpers.
//
// Context: users were being logged out involuntarily when the backend reset
// (refresh tokens got invalidated server-side). Re-using the stored refresh
// token to "quick unlock" would fail in exactly that scenario — the token is
// the thing that got rejected. So instead we capture the email/password at
// login time, keep them in the OS keychain (encrypted at rest via SecureStore),
// and gate a full re-login behind a Face ID / Touch ID / fingerprint scan.
// That survives server-side token invalidation, which is the whole point.
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CREDENTIALS_KEY = 'biometricCredentials';
const ENABLED_KEY = 'biometricEnabled';

export interface BiometricCredentials {
  email: string;
  password: string;
}

// Hardware present AND a face/fingerprint actually enrolled. Both must be true
// or there's nothing to authenticate against.
export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

// Human-facing label for the strongest available method, for button/prompt copy.
export async function getBiometricLabel(): Promise<string> {
  if (Platform.OS === 'web') return 'Biometrics';
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    }
    return 'Biometrics';
  } catch {
    return 'Biometrics';
  }
}

// Show the OS biometric prompt. Passcode fallback stays enabled so a failed
// scan (sweaty finger, mask on) isn't a dead end. Returns true on success.
export async function promptBiometric(promptMessage: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

// Persist credentials in the keychain and flip the enabled flag. Callers must
// confirm a successful biometric scan BEFORE calling this.
export async function storeBiometricCredentials(email: string, password: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify({ email, password }));
  await AsyncStorage.setItem(ENABLED_KEY, 'true');
}

export async function getBiometricCredentials(): Promise<BiometricCredentials | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(CREDENTIALS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BiometricCredentials;
  } catch {
    return null;
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  } catch {
    // ignore — nothing stored
  }
  await AsyncStorage.removeItem(ENABLED_KEY);
}
