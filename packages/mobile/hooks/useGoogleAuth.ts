import { useState, useEffect } from 'react';
import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';
import { useAuth } from '../store/AuthContext';

// Google OAuth Client IDs
const GOOGLE_CLIENT_ID_WEB = '499367908516-f5qu2rjeot6iqnhld7o3tg71tqdqlngk.apps.googleusercontent.com';

// Configure Google Sign-In on module load
GoogleSignin.configure({
  webClientId: GOOGLE_CLIENT_ID_WEB,
  offlineAccess: true,
  scopes: ['profile', 'email'],
});

export function useGoogleAuth() {
  const { loginWithGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    setError(null);
    setIsLoading(true);

    try {
      console.log('[GoogleAuth] Starting native Google Sign-In...');

      // Check if Google Play Services are available
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Sign out first to force account picker to show
      // (otherwise it auto-selects the last used account)
      await GoogleSignin.signOut();

      // Sign in - will now show account picker
      const response = await GoogleSignin.signIn();
      console.log('[GoogleAuth] Sign-in response type:', response.type);

      if (isSuccessResponse(response)) {
        const { idToken } = response.data;
        console.log('[GoogleAuth] Got idToken:', idToken ? 'yes' : 'no');

        if (idToken) {
          await loginWithGoogle(idToken);
        } else {
          setError('No ID token received from Google');
        }
      } else {
        // User cancelled
        console.log('[GoogleAuth] User cancelled sign-in');
        setError(null);
      }
    } catch (err) {
      console.error('[GoogleAuth] Error:', err);

      if (isErrorWithCode(err)) {
        switch (err.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            // User cancelled, don't show error
            console.log('[GoogleAuth] Sign-in cancelled by user');
            break;
          case statusCodes.IN_PROGRESS:
            setError('Sign-in already in progress');
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            setError('Google Play Services not available');
            break;
          default:
            setError(err.message || 'Google sign-in failed');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Google sign-in failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return {
    signInWithGoogle,
    isLoading,
    error,
    isReady: true, // Native sign-in is always ready
  };
}

export default useGoogleAuth;
