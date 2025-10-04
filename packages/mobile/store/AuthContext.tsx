import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { AnalyticsService } from '../services/analytics';
import { notificationService } from '../services/notificationService';
import type { Notification, NotificationResponse } from 'expo-notifications';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  isEmailVerified: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getApiBaseUrl = () => {
  const isDevelopment = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    return 'https://your-production-api.com/api';
  }

  // In development, use localhost for web and network IP for mobile
  if (Platform.OS === 'web') {
    return 'http://localhost:3001/api';
  } else {
    return 'http://10.0.0.53:3001/api';  // Network IP for mobile devices
  }
};

const API_BASE_URL = getApiBaseUrl();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user && !!accessToken;

  // Initialize auth state on app start
  useEffect(() => {
    initializeAuth();
    // Initialize analytics service
    AnalyticsService.initialize();

    // Setup notification response listener
    const subscription = notificationService.addNotificationResponseListener(
      handleNotificationResponse
    );

    return () => subscription.remove();
  }, []);

  const initializeAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
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
        throw new Error(data.error || 'Login failed');
      }

      // Store tokens and user data
      await AsyncStorage.setItem('accessToken', data.accessToken);
      await AsyncStorage.setItem('refreshToken', data.refreshToken);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));

      setAccessToken(data.accessToken);
      setUser(data.user);

      // Set user ID for analytics
      await AnalyticsService.setUserId(data.user.id);

      // Track successful login
      await AnalyticsService.trackUserLogin();

      // Register push token
      await notificationService.registerPushToken();

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Login error:', error);
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

      // Store tokens and user data
      await AsyncStorage.setItem('accessToken', data.accessToken);
      await AsyncStorage.setItem('refreshToken', data.refreshToken);
      await AsyncStorage.setItem('userData', JSON.stringify(data.user));

      setAccessToken(data.accessToken);
      setUser(data.user);

      // Set user ID for analytics
      await AnalyticsService.setUserId(data.user.id);

      // Track successful registration
      await AnalyticsService.trackUserRegistration();

      // Register push token
      await notificationService.registerPushToken();

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      
      if (refreshToken) {
        // Call logout endpoint to revoke tokens
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      // Clear local storage regardless of API call success
      await AsyncStorage.removeItem('accessToken');
      await AsyncStorage.removeItem('refreshToken');
      await AsyncStorage.removeItem('userData');

      setAccessToken(null);
      setUser(null);

      // Clear analytics user ID and end session
      await AnalyticsService.clearUserId();
      await AnalyticsService.endSession();

      // Navigate to auth screen
      router.replace('/(auth)/login');
    }
  };

  const refreshToken = async () => {
    try {
      const storedRefreshToken = await AsyncStorage.getItem('refreshToken');

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

      // Update stored tokens
      await AsyncStorage.setItem('accessToken', data.accessToken);
      await AsyncStorage.setItem('refreshToken', data.refreshToken);

      setAccessToken(data.accessToken);
    } catch (error) {
      console.error('Token refresh error:', error);
      // If refresh fails, logout user
      await logout();
      throw error;
    }
  };

  const handleNotificationResponse = (response: NotificationResponse) => {
    const data = response.notification.request.content.data;

    // Handle different notification types and navigate accordingly
    if (data.eventId) {
      router.push(`/(tabs)/events/${data.eventId}`);
    } else if (data.fightId) {
      router.push(`/(tabs)/fights`); // TODO: Add fight detail screen
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
    register,
    logout,
    refreshToken,
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