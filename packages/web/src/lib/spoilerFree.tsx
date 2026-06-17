'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuth } from './auth';

interface SpoilerFreeContextType {
  spoilerFreeMode: boolean;
  setSpoilerFreeMode: (val: boolean) => void;
}

const SpoilerFreeContext = createContext<SpoilerFreeContextType | undefined>(undefined);

// Logged-in users get a durable preference (persists across sessions).
const LS_KEY = 'spoilerFreeMode';
// Logged-out users get a per-session override only: sessionStorage clears when
// the tab/browser session ends, so they're back to the default-ON next visit.
const SS_KEY = 'spoilerFreeMode:session';

export function SpoilerFreeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  // Default ON. This is the safe first-paint value (don't flash spoilers before
  // we know who the visitor is) and the standing default for logged-out users.
  const [spoilerFreeMode, setSpoilerFreeMode] = useState(true);

  // Resolve the effective mode once auth state is known, and re-resolve on
  // login/logout. Guests read their per-session override (default ON); logged-in
  // users read their persisted preference (default OFF, unchanged from before).
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      const stored = localStorage.getItem(LS_KEY);
      setSpoilerFreeMode(stored === null ? false : stored === 'true');
    } else {
      const sess = sessionStorage.getItem(SS_KEY);
      setSpoilerFreeMode(sess === null ? true : sess === 'true');
    }
  }, [isAuthenticated, isLoading]);

  const handleSet = (val: boolean) => {
    setSpoilerFreeMode(val);
    if (typeof window === 'undefined') return;
    if (isAuthenticated) {
      localStorage.setItem(LS_KEY, String(val));
    } else {
      // Session-scoped: retained while browsing, gone next session → back to ON.
      sessionStorage.setItem(SS_KEY, String(val));
    }
  };

  return (
    <SpoilerFreeContext.Provider value={{ spoilerFreeMode, setSpoilerFreeMode: handleSet }}>
      {children}
    </SpoilerFreeContext.Provider>
  );
}

export function useSpoilerFree() {
  const context = useContext(SpoilerFreeContext);
  if (!context) throw new Error('useSpoilerFree must be used within SpoilerFreeProvider');
  return context;
}
