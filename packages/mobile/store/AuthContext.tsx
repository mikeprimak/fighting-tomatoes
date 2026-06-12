import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { secureStorage } from '../utils/secureStorage';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  storeBiometricCredentials,
  getBiometricCredentials,
  clearBiometricCredentials,
  promptBiometric,
} from '../utils/biometricAuth';
import { AnalyticsService } from '../services/analytics';
import { notificationService } from '../services/notificationService';
import { markOnboardingPending } from '../services/onboarding';
import type { Notification, NotificationResponse } from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { posthog } from '../services/posthog';
import { queryClient } from '../app/_layout';

const tagSentryUser = (user: { id: string; email: string; displayName?: string | null } | null) => {
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email, username: user.displayName ?? undefined });
  } else {
    Sentry.setUser(null);
  }
};

const identifyPosthog = (user: { id: string; email: string; displayName?: string | null } | null) => {
  if (!posthog) return;
  if (user) {
    posthog.identify(user.id, {
      email: user.email,
      displayName: user.displayName ?? undefined,
    });
  } else {
    posthog.reset();
  }
};

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatar?: string;
  isEmailVerified: boolean;
  createdAt: string;
  totalRatings?: number;
  totalReviews?: number;
  averageRating?: number;
  averageHype?: number;
  totalHype?: number;
  ratingDistribution?: Record<string, number>;
  hypeDistribution?: Record<string, number>;
  totalWinnerPredictions?: number;
  completedWinnerPredictions?: number;
  correctWinnerPredictions?: number;
  winnerAccuracy?: number;
  totalMethodPredictions?: number;
  completedMethodPredictions?: number;
  correctMethodPredictions?: number;
  methodAccuracy?: number;
  points?: number;
  level?: number;
  broadcastRegion?: 'US' | 'CA' | 'GB' | 'AU' | 'NZ' | 'EU' | null;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  // Biometric quick-unlock
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithApple: (identityToken: string, email?: string, firstName?: string, lastName?: string) => Promise<void>;
  loginWithBiometric: () => Promise<void>;
  enableBiometricLogin: (email: string, password: string) => Promise<boolean>;
  disableBiometricLogin: () => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  refreshUserData: (orgs?: string[]) => Promise<void>;
  continueAsGuest: () => void;
}

interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getApiBaseUrl = () => {
  // TEMPORARY: Use production API for pre-launch testing
  const USE_PRODUCTION_FOR_TESTING = true;

  // __DEV__ is true in Expo Go and development builds, false in production/TestFlight builds
  const isDevBuild = typeof __DEV__ !== 'undefined' && __DEV__ === true;

  // Production/TestFlight builds → always use Render
  if (!isDevBuild || USE_PRODUCTION_FOR_TESTING) {
    return 'https://fightcrewapp-backend.onrender.com/api';
  }

  // Development builds → use local backend
  if (Platform.OS === 'web') {
    return 'http://localhost:3008/api';
  } else {
    return 'http://10.0.0.51:3008/api';  // Your local dev machine
  }
};

const API_BASE_URL = getApiBaseUrl();

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

// Outcome of a token-refresh attempt (mirrors services/api.ts):
//  - 'success':   new tokens stored, caller may proceed
//  - 'invalid':   the refresh token was genuinely rejected (real logout)
//  - 'transient': server unreachable / 5xx (e.g. backend mid-redeploy) — do NOT
//                 log out, the session is still valid, the server is just briefly
//                 unreachable
type RefreshOutcome = 'success' | 'invalid' | 'transient';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    tagSentryUser(user);
    identifyPosthog(user);
  }, [user?.id]);
  const [isGuest, setIsGuest] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const appState = useRef(AppState.currentState);

  const isAuthenticated = !!user && !!accessToken;

  // Hardened token refresh shared by initializeAuth, the foreground refresh, and
  // refreshUserData. A 5xx / network failure during a backend redeploy is
  // TRANSIENT and must NOT log the user out — only a genuine 4xx rejection from
  // the refresh endpoint clears the session. Retries transient failures a few
  // times before giving up. On success the new tokens are persisted and synced
  // into state. Mirrors services/api.ts so every refresh path behaves the same.
  const tryRefreshTokens = async (): Promise<RefreshOutcome> => {
    const storedRefreshToken = await secureStorage.getItem('refreshToken');
    if (!storedRefreshToken) return 'invalid';

    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [300, 800];

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedRefreshToken }),
        });

        // 5xx (incl. 502/503 from the proxy while the container restarts) is
        // transient — retry, never log out.
        if (res.status >= 500) {
          console.log(`[Auth] Refresh got ${res.status} (server unavailable), will retry`);
          await sleep(BACKOFF_MS[attempt] ?? 0);
          continue;
        }

        const data = await res.json().catch(() => ({}));

        // 4xx = the refresh token was genuinely rejected → real logout.
        if (!res.ok) {
          console.log('[Auth] Refresh rejected:', data.error || data.code);
          return 'invalid';
        }

        const newAccessToken = data.tokens?.accessToken || data.accessToken;
        const newRefreshToken = data.tokens?.refreshToken || data.refreshToken;
        if (newAccessToken && newRefreshToken) {
          await secureStorage.setItem('accessToken', newAccessToken);
          await secureStorage.setItem('refreshToken', newRefreshToken);
          setAccessToken(newAccessToken);
          return 'success';
        }

        // 2xx but malformed body — server hiccup, not a logout.
        await sleep(BACKOFF_MS[attempt] ?? 0);
      } catch (error) {
        // fetch threw → network error / timeout. Transient: retry, don't log out.
        console.log('[Auth] Refresh network error, will retry:', error);
        await sleep(BACKOFF_MS[attempt] ?? 0);
      }
    }

    console.log('[Auth] Refresh exhausted retries — treating as transient (no logout)');
    return 'transient';
  };

  // Internal refresh function for use in effects
  const refreshUserDataInternal = async (orgs?: string[]) => {
    try {
      const token = await secureStorage.getItem('accessToken');
      if (!token) {
        // Token was cleared (possibly by API service after failed refresh)
        // Clear auth state to trigger logout
        console.log('[Auth] No access token found, clearing auth state');
        setAccessToken(null);
        setUser(null);
        return;
      }

      // Build URL with optional org filter
      let url = `${API_BASE_URL}/auth/profile`;
      if (orgs && orgs.length > 0) {
        url += `?orgs=${orgs.join(',')}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      // Handle 401 - access token expired, try refresh before logging out
      if (response.status === 401) {
        console.log('[Auth] Got 401 on profile fetch, attempting token refresh...');
        const outcome = await tryRefreshTokens();

        if (outcome === 'success') {
          // Retry the profile fetch with the freshly stored token.
          const newAccessToken = await secureStorage.getItem('accessToken');
          const retryResponse = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${newAccessToken}` },
          });
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            if (retryData.user) {
              setUser(retryData.user);
              if (!orgs || orgs.length === 0) {
                await AsyncStorage.setItem('userData', JSON.stringify(retryData.user));
              }
            }
          }
          return;
        }

        if (outcome === 'transient') {
          // Backend briefly unreachable (mid-redeploy). Keep the session — the
          // next request will refresh once the server is back.
          console.log('[Auth] Refresh transient on foreground; keeping session');
          return;
        }

        // 'invalid' — refresh token genuinely rejected. Only now clear auth.
        console.log('[Auth] Token genuinely rejected, clearing auth state');
        await secureStorage.removeItem('accessToken');
        await secureStorage.removeItem('refreshToken');
        await AsyncStorage.removeItem('userData');
        setAccessToken(null);
        setUser(null);
        return;
      }

      const data = await response.json();
      if (response.ok && data.user) {
        setUser(data.user);
        // Sync access token state in case API service refreshed it
        const currentToken = await secureStorage.getItem('accessToken');
        if (currentToken && currentToken !== accessToken) {
          setAccessToken(currentToken);
        }
        // Only save to storage if no filter is active (preserve full data)
        if (!orgs || orgs.length === 0) {
          await AsyncStorage.setItem('userData', JSON.stringify(data.user));
        }
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  };

  // Probe biometric capability + saved preference once on mount so the login
  // screen can decide whether to show the quick-unlock button.
  useEffect(() => {
    (async () => {
      const [available, enabled] = await Promise.all([
        isBiometricAvailable(),
        isBiometricEnabled(),
      ]);
      setBiometricAvailable(available);
      setBiometricEnabled(enabled);
    })();
  }, []);

  // Initialize auth state on app start
  useEffect(() => {
    initializeAuth();
    // Initialize analytics service - TEMPORARILY DISABLED (analytics routes disabled)
    // AnalyticsService.initialize();

    // Setup notification response listener
    const subscription = notificationService.addNotificationResponseListener(
      handleNotificationResponse
    );

    return () => subscription.remove();
  }, []);

  // Refresh user data when app comes to foreground
  // This catches changes made externally (e.g., email verification via web)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        accessToken
      ) {
        console.log('App came to foreground, refreshing user data...');
        await refreshUserDataInternal();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [accessToken]);

  const initializeAuth = async () => {
    try {
      const token = await secureStorage.getItem('accessToken');
      const userData = await AsyncStorage.getItem('userData');

      if (token && userData) {
        // Validate token by calling profile endpoint
        console.log('[Auth] Found stored token, validating...');
        const response = await fetch(`${API_BASE_URL}/auth/profile`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.status === 401) {
          // Token expired, try to refresh
          console.log('[Auth] Token expired, attempting refresh...');
          const outcome = await tryRefreshTokens();

          if (outcome === 'success') {
            console.log('[Auth] Token refresh successful');
            // tryRefreshTokens already persisted + synced the new access token.
            setUser(JSON.parse(userData));
            return;
          }

          if (outcome === 'transient') {
            // Backend mid-redeploy (5xx / network). Don't log out on a heavy
            // push day — keep the cached session; api.ts will refresh on the
            // next real request once the server is back.
            console.log('[Auth] Refresh transient on startup; using cached session');
            setAccessToken(token);
            setUser(JSON.parse(userData));
            return;
          }

          // 'invalid' — refresh token genuinely rejected. Clear + send to login.
          console.log('[Auth] Token genuinely rejected, clearing auth state');
          await secureStorage.removeItem('accessToken');
          await secureStorage.removeItem('refreshToken');
          await AsyncStorage.removeItem('userData');
          return;
        }

        if (response.ok) {
          const data = await response.json();
          console.log('[Auth] Token valid, user authenticated');
          setAccessToken(token);
          setUser(data.user);
          // Update cached user data with fresh data
          await AsyncStorage.setItem('userData', JSON.stringify(data.user));
          // Register push token on app startup (not just login)
          notificationService.registerPushToken();
        } else {
          // Non-401, non-ok (e.g. 502/503 while the backend redeploys). This is
          // NOT an auth failure — keep the cached session rather than wiping it.
          // The token is still valid; it will revalidate on the next request.
          console.log('[Auth] Profile fetch got transient status, using cached session:', response.status);
          setAccessToken(token);
          setUser(JSON.parse(userData));
        }
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      // On network error, use cached data but it will revalidate when online
      const token = await secureStorage.getItem('accessToken');
      const userData = await AsyncStorage.getItem('userData');
      if (token && userData) {
        console.log('[Auth] Network error during validation, using cached data');
        setAccessToken(token);
        setUser(JSON.parse(userData));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Check for legacy account claim required
        if (data.code === 'ACCOUNT_CLAIM_REQUIRED' && data.requiresAccountClaim) {
          // Navigate to claim account screen with the email
          router.push({
            pathname: '/(auth)/claim-account',
            params: { email: data.email || email }
          });
          return; // Don't throw error, we're handling it
        }
        throw new Error(data.error || 'Login failed');
      }

      // Store tokens securely and user data
      await secureStorage.setItem('accessToken', data.accessToken);
      await secureStorage.setItem('refreshToken', data.refreshToken);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));

      setAccessToken(data.accessToken);
      setUser(data.user);
      setIsGuest(false); // Clear guest mode on login

      // If biometric quick-unlock is already on, keep the stored credentials in
      // sync with what just worked (covers a password change since enabling).
      if (await isBiometricEnabled()) {
        await storeBiometricCredentials(email, password);
      }

      // Clear query cache to ensure fresh data for the new user
      queryClient.clear();
      console.log('Query cache cleared on login');

      // Set user ID for analytics - TEMPORARILY DISABLED
      // await AnalyticsService.setUserId(data.user.id);

      // Track successful login - TEMPORARILY DISABLED
      // await AnalyticsService.trackUserLogin();

      // Register push token for fight notifications
      notificationService.registerPushToken();

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const loginWithGoogle = async (idToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Google authentication failed');
      }

      // Store tokens securely and user data
      await secureStorage.setItem('accessToken', data.tokens.accessToken);
      await secureStorage.setItem('refreshToken', data.tokens.refreshToken);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));

      setAccessToken(data.tokens.accessToken);
      setUser(data.user);
      setIsGuest(false); // Clear guest mode on login

      // Clear query cache to ensure fresh data for the new user
      queryClient.clear();
      console.log('Query cache cleared on Google login');

      // Register push token for fight notifications
      notificationService.registerPushToken();

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const loginWithApple = async (identityToken: string, email?: string, firstName?: string, lastName?: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/apple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identityToken, email, firstName, lastName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Apple authentication failed');
      }

      // Store tokens securely and user data
      await secureStorage.setItem('accessToken', data.tokens.accessToken);
      await secureStorage.setItem('refreshToken', data.tokens.refreshToken);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));

      setAccessToken(data.tokens.accessToken);
      setUser(data.user);
      setIsGuest(false); // Clear guest mode on login

      // Clear query cache to ensure fresh data for the new user
      queryClient.clear();
      console.log('Query cache cleared on Apple login');

      // Register push token for fight notifications
      notificationService.registerPushToken();

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Apple login error:', error);
      throw error;
    }
  };

  // Quick-unlock: confirm a biometric scan, then replay the stored credentials
  // through the normal login path (which stores fresh tokens + navigates). We
  // re-login rather than reuse the refresh token on purpose — the logouts this
  // feature exists to fix are caused by the refresh token being rejected, so a
  // full re-auth is the only thing guaranteed to work in that case.
  const loginWithBiometric = async () => {
    const creds = await getBiometricCredentials();
    if (!creds) {
      throw new Error('No saved sign-in found. Please sign in with your password.');
    }
    const ok = await promptBiometric('Sign in to Good Fights');
    if (!ok) {
      throw new Error('Authentication cancelled');
    }
    try {
      await login(creds.email, creds.password);
    } catch (error) {
      // If the password is genuinely wrong (e.g. changed elsewhere, or a typo
      // when enabling from Settings), the stored creds are useless — clear them
      // and disable so the user falls back to password sign-in cleanly. Network
      // / server errors are NOT auth failures, so leave the setup intact then.
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('invalid') || message.includes('password') || message.includes('credential')) {
        await clearBiometricCredentials();
        setBiometricEnabled(false);
        throw new Error('Saved password no longer works. Please sign in with your password.');
      }
      throw error;
    }
  };

  // Called right after a successful manual login (the screen still has the
  // plaintext password in state). Confirms a scan, then stores the credentials.
  const enableBiometricLogin = async (email: string, password: string): Promise<boolean> => {
    if (!(await isBiometricAvailable())) return false;
    const ok = await promptBiometric('Confirm to enable quick sign-in');
    if (!ok) return false;
    await storeBiometricCredentials(email, password);
    setBiometricAvailable(true);
    setBiometricEnabled(true);
    return true;
  };

  const disableBiometricLogin = async () => {
    await clearBiometricCredentials();
    setBiometricEnabled(false);
  };

  const register = async (userData: RegisterData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Store tokens securely and user data
      await secureStorage.setItem('accessToken', data.accessToken);
      await secureStorage.setItem('refreshToken', data.refreshToken);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));

      setAccessToken(data.accessToken);
      setUser(data.user);
      setIsGuest(false); // Clear guest mode on registration

      // Set user ID for analytics - TEMPORARILY DISABLED
      // await AnalyticsService.setUserId(data.user.id);

      // Track successful registration - TEMPORARILY DISABLED
      // await AnalyticsService.trackUserRegistration();

      // Register push token for fight notifications
      notificationService.registerPushToken();

      // New accounts get the identity onboarding flow; the verify-email
      // screens check this flag and route to /(onboarding)/welcome.
      await markOnboardingPending();

      // Navigate to email verification pending screen for email signups
      // (Google signups are already verified and go straight to main app)
      router.replace({
        pathname: '/(auth)/verify-email-pending',
        params: { email: userData.email },
      });
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const refreshToken = await secureStorage.getItem('refreshToken');

      if (refreshToken) {
        // Call logout endpoint to revoke tokens with a timeout
        // Don't block on this - the local cleanup is what matters
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

        try {
          await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
            signal: controller.signal,
          });
        } catch (fetchError) {
          // Ignore fetch errors - we'll still clean up locally
          console.log('Logout API call failed (continuing with local cleanup):', fetchError);
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      // Clear local storage regardless of API call success
      await secureStorage.removeItem('accessToken');
      await secureStorage.removeItem('refreshToken');
      await AsyncStorage.removeItem('userData');

      setAccessToken(null);
      setUser(null);

      // Clear all React Query cache to prevent data from previous user showing
      queryClient.clear();
      console.log('Query cache cleared on logout');

      // Clear analytics user ID and end session - TEMPORARILY DISABLED
      // await AnalyticsService.clearUserId();
      // await AnalyticsService.endSession();

      // Navigate to auth screen
      router.replace('/(auth)/login');
    }
  };

  const refreshToken = async () => {
    const outcome = await tryRefreshTokens();
    if (outcome === 'success') {
      // tryRefreshTokens already persisted + synced the new access token.
      return;
    }
    if (outcome === 'transient') {
      // Server briefly unreachable (mid-redeploy). Do NOT log out — keep the
      // session and let the caller decide. Throw so callers can retry.
      throw new Error('Token refresh temporarily unavailable');
    }
    // 'invalid' — refresh token genuinely rejected. Real logout.
    await logout();
    throw new Error('Token refresh failed');
  };

  const refreshUserData = async (orgs?: string[]) => {
    try {
      const token = await secureStorage.getItem('accessToken');

      if (!token) {
        // Token was cleared (possibly by API service after failed refresh)
        console.log('[Auth] No access token available for refresh');
        setAccessToken(null);
        setUser(null);
        return;
      }

      // Build URL with optional org filter
      let url = `${API_BASE_URL}/auth/profile`;
      if (orgs && orgs.length > 0) {
        url += `?orgs=${orgs.join(',')}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // Handle 401 - access token expired, try refresh before logging out
      if (response.status === 401) {
        console.log('[Auth] Got 401 on refreshUserData, attempting token refresh...');
        const outcome = await tryRefreshTokens();

        if (outcome === 'success') {
          // Retry the profile fetch with the freshly stored token.
          const newAccessToken = await secureStorage.getItem('accessToken');
          const retryResponse = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${newAccessToken}` },
          });
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            if (retryData.user) {
              setUser(retryData.user);
              if (!orgs || orgs.length === 0) {
                await AsyncStorage.setItem('userData', JSON.stringify(retryData.user));
              }
            }
          }
          return;
        }

        if (outcome === 'transient') {
          // Backend briefly unreachable (mid-redeploy). Keep the session.
          console.log('[Auth] Refresh transient on refreshUserData; keeping session');
          return;
        }

        // 'invalid' — refresh token genuinely rejected. Only now clear auth.
        console.log('[Auth] Token genuinely rejected, clearing auth state');
        await secureStorage.removeItem('accessToken');
        await secureStorage.removeItem('refreshToken');
        await AsyncStorage.removeItem('userData');
        setAccessToken(null);
        setUser(null);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to refresh user data:', data.error);
        return;
      }

      // Update user data in state
      setUser(data.user);
      // Sync access token state in case API service refreshed it
      const currentToken = await secureStorage.getItem('accessToken');
      if (currentToken && currentToken !== accessToken) {
        setAccessToken(currentToken);
      }
      // Only save to storage if no filter is active (preserve full data)
      if (!orgs || orgs.length === 0) {
        await AsyncStorage.setItem('userData', JSON.stringify(data.user));
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  };

  const handleNotificationResponse = (response: NotificationResponse) => {
    const data = response.notification.request.content.data;

    // Handle different notification types and navigate accordingly
    if (data.eventId) {
      router.push(`/(tabs)/events/${data.eventId}`);
    } else if (data.fightId) {
      router.push(`/fight/${data.fightId}`);
    } else if (data.crewId) {
      router.push(`/crew/${data.crewId}`);
    } else if (data.screen) {
      // Handle generic screen navigation
      router.push(data.screen as any);
    }
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    router.replace('/(tabs)');
  };

  const value: AuthContextType = {
    user,
    accessToken,
    isLoading,
    isAuthenticated,
    isGuest,
    biometricAvailable,
    biometricEnabled,
    login,
    loginWithGoogle,
    loginWithApple,
    loginWithBiometric,
    enableBiometricLogin,
    disableBiometricLogin,
    register,
    logout,
    refreshToken,
    refreshUserData,
    continueAsGuest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}