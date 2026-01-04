import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { secureStorage } from '../utils/secureStorage';
import { AnalyticsService } from '../services/analytics';
import { notificationService } from '../services/notificationService';
import type { Notification, NotificationResponse } from 'expo-notifications';
import { queryClient } from '../app/_layout';

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
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithApple: (identityToken: string, email?: string, firstName?: string, lastName?: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  refreshUserData: (orgs?: string[]) => Promise<void>;
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
    return 'http://10.0.0.53:3008/api';  // Your local dev machine
  }
};

const API_BASE_URL = getApiBaseUrl();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  const isAuthenticated = !!user && !!accessToken;

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

      // Handle 401 - token expired and API service couldn't refresh
      if (response.status === 401) {
        console.log('[Auth] Got 401 on profile fetch, clearing auth state');
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
        setAccessToken(token);
        setUser(JSON.parse(userData));

        // Register push token if user is logged in
        await notificationService.registerPushToken();
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
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

      // Clear query cache to ensure fresh data for the new user
      queryClient.clear();
      console.log('Query cache cleared on login');

      // Set user ID for analytics - TEMPORARILY DISABLED
      // await AnalyticsService.setUserId(data.user.id);

      // Track successful login - TEMPORARILY DISABLED
      // await AnalyticsService.trackUserLogin();

      // Register push token
      await notificationService.registerPushToken();

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

      // Clear query cache to ensure fresh data for the new user
      queryClient.clear();
      console.log('Query cache cleared on Google login');

      // Register push token
      await notificationService.registerPushToken();

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

      // Clear query cache to ensure fresh data for the new user
      queryClient.clear();
      console.log('Query cache cleared on Apple login');

      // Register push token
      await notificationService.registerPushToken();

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Apple login error:', error);
      throw error;
    }
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

      // Set user ID for analytics - TEMPORARILY DISABLED
      // await AnalyticsService.setUserId(data.user.id);

      // Track successful registration - TEMPORARILY DISABLED
      // await AnalyticsService.trackUserRegistration();

      // Register push token
      await notificationService.registerPushToken();

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
    try {
      const storedRefreshToken = await secureStorage.getItem('refreshToken');

      if (!storedRefreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Token refresh failed');
      }

      // Update stored tokens securely
      await secureStorage.setItem('accessToken', data.accessToken);
      await secureStorage.setItem('refreshToken', data.refreshToken);

      setAccessToken(data.accessToken);
    } catch (error) {
      console.error('Token refresh error:', error);
      // If refresh fails, logout user
      await logout();
      throw error;
    }
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

      // Handle 401 - token expired
      if (response.status === 401) {
        console.log('[Auth] Got 401 on refreshUserData, clearing auth state');
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

  const value: AuthContextType = {
    user,
    accessToken,
    isLoading,
    isAuthenticated,
    login,
    loginWithGoogle,
    loginWithApple,
    register,
    logout,
    refreshToken,
    refreshUserData,
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