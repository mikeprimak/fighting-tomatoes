'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  // True when this account has a push token registered (i.e. uses the mobile app).
  // Only populated by /auth/profile; undefined on the minimal login/register response.
  hasApp?: boolean;
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

// Login/register/OAuth responses return a minimal user with no aggregate
// counts (totalRatings/totalHype/totalReviews). /auth/profile returns the full
// shape, so we fetch it after every login to populate the sidebar stats right
// away instead of showing 0 until a manual refresh.
async function fetchProfile(): Promise<User | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'https://fightcrewapp-backend.onrender.com/api'}/auth/profile`,
      { headers: { Authorization: `Bearer ${getAccessToken()}` } },
    );
    if (res.ok) {
      const data = await res.json();
      return (data.user || data) as User;
    }
  } catch {
    // Ignore — fall back to the login-response user.
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const queryClient = useQueryClient();
  const lastUserIdRef = useRef<string | null>(null);

  const isAuthenticated = !!user && !!getAccessToken();

  useEffect(() => {
    const tryRefresh = async () => {
      try {
        const ok = await refreshSession();
        if (ok) {
          const full = await fetchProfile();
          if (full) setUser(full);
        }
      } catch {
        // Not logged in
      } finally {
        setIsLoading(false);
      }
    };
    tryRefresh();
  }, []);

  // Refetch user-scoped queries when auth identity changes. Most pages mount
  // and fire queries before refreshSession() resolves, so the first response
  // comes back unauthenticated (missing userHypePrediction, userRating, etc.)
  // and React Query caches it. Once the user lands, we kick the relevant
  // queries to repull with the token attached.
  useEffect(() => {
    const id = user?.id ?? null;
    if (id === lastUserIdRef.current) return;
    lastUserIdRef.current = id;
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['event'] });
    queryClient.invalidateQueries({ queryKey: ['eventFights'] });
    queryClient.invalidateQueries({ queryKey: ['topFights'] });
    queryClient.invalidateQueries({ queryKey: ['fight'] });
    queryClient.invalidateQueries({ queryKey: ['fightStats'] });
    queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
    queryClient.invalidateQueries({ queryKey: ['myRatings'] });
    queryClient.invalidateQueries({ queryKey: ['followedFighters'] });
    queryClient.invalidateQueries({ queryKey: ['preFightComments'] });
    queryClient.invalidateQueries({ queryKey: ['fightReviews'] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
  }, [user?.id, queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setUser(data.user);
    setIsGuest(false);
    const full = await fetchProfile();
    if (full) setUser(full);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const data = await apiLoginWithGoogle(idToken);
    setUser(data.user);
    setIsGuest(false);
    const full = await fetchProfile();
    if (full) setUser(full);
  }, []);

  const loginWithApple = useCallback(async (payload: { identityToken: string; email?: string; firstName?: string; lastName?: string }) => {
    const data = await apiLoginWithApple(payload);
    setUser(data.user);
    setIsGuest(false);
    const full = await fetchProfile();
    if (full) setUser(full);
  }, []);

  const register = useCallback(async (userData: { email: string; password: string; firstName?: string; lastName?: string; displayName?: string }) => {
    const data = await apiRegister(userData);
    setUser(data.user);
    setIsGuest(false);
    const full = await fetchProfile();
    if (full) setUser(full);
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

// Whether the signed-in account already uses the mobile app (has a registered
// push token). Used to reframe/suppress "Get the app" CTAs. Treats the unknown
// state (logged out, or profile not yet fetched) as false so the CTA shows by default.
export function useHasApp(): boolean {
  const { user } = useAuth();
  return !!user?.hasApp;
}
