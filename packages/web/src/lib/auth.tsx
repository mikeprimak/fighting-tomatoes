'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { setAccessToken, getAccessToken, refreshSession, logout as apiLogout, login as apiLogin, register as apiRegister, loginWithGoogle as apiLoginWithGoogle, loginWithApple as apiLoginWithApple } from './api';

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
  points?: number;
  level?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithApple: (payload: { identityToken: string; email?: string; firstName?: string; lastName?: string }) => Promise<void>;
  register: (data: { email: string; password: string; firstName?: string; lastName?: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const isAuthenticated = !!user && !!getAccessToken();

  useEffect(() => {
    const tryRefresh = async () => {
      try {
        const ok = await refreshSession();
        if (ok) {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://fightcrewapp-backend.onrender.com/api'}/auth/profile`, {
            headers: { Authorization: `Bearer ${getAccessToken()}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user || data);
          }
        }
      } catch {
        // Not logged in
      } finally {
        setIsLoading(false);
      }
    };
    tryRefresh();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setUser(data.user);
    setIsGuest(false);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const data = await apiLoginWithGoogle(idToken);
    setUser(data.user);
    setIsGuest(false);
  }, []);

  const loginWithApple = useCallback(async (payload: { identityToken: string; email?: string; firstName?: string; lastName?: string }) => {
    const data = await apiLoginWithApple(payload);
    setUser(data.user);
    setIsGuest(false);
  }, []);

  const register = useCallback(async (userData: { email: string; password: string; firstName?: string; lastName?: string; displayName?: string }) => {
    const data = await apiRegister(userData);
    setUser(data.user);
    setIsGuest(false);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setIsGuest(false);
  }, []);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
    setUser(null);
    setAccessToken(null);
    setIsLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, isGuest, login, loginWithGoogle, loginWithApple, register, logout, continueAsGuest, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
