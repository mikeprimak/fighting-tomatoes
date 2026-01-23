import { useState } from 'react';
import { useAuth } from '../store/AuthContext';

// Google OAuth Client IDs - these are PUBLIC by design (not secrets)
// Security is enforced via package name, SHA-1 fingerprint, and app store verification
// See: https://developers.google.com/identity/protocols/oauth2
const GOOGLE_CLIENT_ID_WEB = '1082468109842-pehb7kkuclbv8g4acjba9eeeajprd8j7.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID_IOS = '1082468109842-qpifgfjjg3ve22bnhofhk99purj0aidf.apps.googleusercontent.com';

// Try to import Google Sign-In, but gracefully handle if not available (e.g., Expo Go dev)
let GoogleSignin: any = null;
let statusCodes: any = {};
let isSuccessResponse: any = () => false;
let isErrorWithCode: any = () => false;
let isGoogleSignInAvailable = false;

try {
  const googleSignIn = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSignIn.GoogleSignin;
  statusCodes = googleSignIn.statusCodes;
  isSuccessResponse = googleSignIn.isSuccessResponse;
  isErrorWithCode = googleSignIn.isErrorWithCode;

  // Configure Google Sign-In
  GoogleSignin.configure({
    webClientId: GOOGLE_CLIENT_ID_WEB,
    iosClientId: GOOGLE_CLIENT_ID_IOS,
    offlineAccess: true,
    scopes: ['profile', 'email'],
  });
  isGoogleSignInAvailable = true;
  console.log('[GoogleAuth] Native Google Sign-In configured successfully');
} catch (e) {
  console.log('[GoogleAuth] Native Google Sign-In not available (expected in Expo Go dev mode)');
}

export function useGoogleAuth() {
  const { loginWithGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    setError(null);
    setIsLoading(true);

    // Check if Google Sign-In is available
    if (!isGoogleSignInAvailable || !GoogleSignin) {
      setError('Google Sign-In not available in dev mode. Use email login.');
      setIsLoading(false);
      return;
    }

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
    isReady: isGoogleSignInAvailable,
    isAvailable: isGoogleSignInAvailable,
  };
}

export default useGoogleAuth;
