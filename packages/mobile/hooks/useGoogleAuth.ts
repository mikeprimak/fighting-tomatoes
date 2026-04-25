import { useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { useAuth } from '../store/AuthContext';

// Google OAuth Client IDs - these are PUBLIC by design (not secrets)
// Security is enforced via package name, SHA-1 fingerprint, and app store verification
// See: https://developers.google.com/identity/protocols/oauth2
// WEB: old project (fight-app-ba5cd / 1082468109842) — has the Android OAuth client registered with the Play Store app signing SHA-1.
// IOS: new project (good-fights-app / 499367908516) — matches the iOS URL scheme baked into the shipped 2.0.2 binary.
// Backend GOOGLE_CLIENT_ID env on Render lists both audiences so tokens from either platform validate.
const GOOGLE_CLIENT_ID_WEB = '1082468109842-pehb7kkuclbv8g4acjba9eeeajprd8j7.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID_IOS = '499367908516-j03poule51s7sfvpvdufna0upqa3oseg.apps.googleusercontent.com';

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

      // Try to sign out first so the account picker shows instead of auto-selecting.
      // Isolated in its own try/catch because on some Android builds this throws a
      // native exception when there's no existing session — we don't want that to
      // block sign-in.
      try {
        await GoogleSignin.signOut();
      } catch (signOutErr) {
        console.log('[GoogleAuth] Pre-signin signOut failed (non-fatal):', signOutErr);
        Sentry.captureMessage('Pre-signin signOut failed (non-fatal)', {
          level: 'warning',
          extra: { error: String(signOutErr) },
        });
      }

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

      const isCancelled = isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED;
      if (!isCancelled) {
        Sentry.captureException(err, {
          tags: { feature: 'google-signin' },
          extra: { errorCode: isErrorWithCode(err) ? err.code : undefined },
        });
      }

      if (isErrorWithCode(err)) {
        switch (err.code) {
          case statusCodes.SIGN_IN_CANCELLED:
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
