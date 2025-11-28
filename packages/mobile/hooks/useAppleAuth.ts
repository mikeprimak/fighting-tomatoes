import { useState, useEffect } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { useAuth } from '../store/AuthContext';

export function useAppleAuth() {
  const { loginWithApple } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  // Check if Apple Sign-In is available on this device
  useEffect(() => {
    const checkAvailability = async () => {
      if (Platform.OS === 'ios') {
        const available = await AppleAuthentication.isAvailableAsync();
        setIsAvailable(available);
      } else {
        // Apple Sign-In is only available on iOS
        setIsAvailable(false);
      }
    };
    checkAvailability();
  }, []);

  const signInWithApple = async () => {
    setError(null);
    setIsLoading(true);

    try {
      console.log('[AppleAuth] Starting Apple Sign-In...');

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      console.log('[AppleAuth] Got credential:', {
        hasIdentityToken: !!credential.identityToken,
        hasEmail: !!credential.email,
        hasFullName: !!credential.fullName,
      });

      if (credential.identityToken) {
        // Apple only provides email and name on first sign-in
        // After that, only identityToken is available
        await loginWithApple(
          credential.identityToken,
          credential.email || undefined,
          credential.fullName?.givenName || undefined,
          credential.fullName?.familyName || undefined
        );
      } else {
        setError('No identity token received from Apple');
      }
    } catch (err: any) {
      console.error('[AppleAuth] Error:', err);

      if (err.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled, don't show error
        console.log('[AppleAuth] Sign-in cancelled by user');
      } else {
        setError(err.message || 'Apple sign-in failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return {
    signInWithApple,
    isLoading,
    error,
    isAvailable,
  };
}

export default useAppleAuth;
