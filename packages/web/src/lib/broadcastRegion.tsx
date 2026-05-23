'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { setBroadcastRegion as apiSetBroadcastRegion, type BroadcastRegion } from './api';
import { useAuth } from './auth';

const STORAGE_KEY = 'broadcastRegionOverride';

interface BroadcastRegionContextType {
  region: BroadcastRegion | null;
  setRegion: (region: BroadcastRegion | null) => Promise<void>;
}

const BroadcastRegionContext = createContext<BroadcastRegionContextType | undefined>(undefined);

export function BroadcastRegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<BroadcastRegion | null>(null);
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    const userRegion = (user as any)?.broadcastRegion as BroadcastRegion | null | undefined;
    if (userRegion) {
      setRegionState(userRegion);
      return;
    }
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setRegionState(stored && stored !== 'null' ? (stored as BroadcastRegion) : null);
    }
  }, [user]);

  const setRegion = useCallback(async (next: BroadcastRegion | null) => {
    setRegionState(next);
    if (typeof window !== 'undefined') {
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
    if (isAuthenticated) {
      try {
        await apiSetBroadcastRegion(next);
      } catch {
        // best-effort; local override still applies
      }
    }
  }, [isAuthenticated]);

  return (
    <BroadcastRegionContext.Provider value={{ region, setRegion }}>
      {children}
    </BroadcastRegionContext.Provider>
  );
}

export function useBroadcastRegion() {
  const ctx = useContext(BroadcastRegionContext);
  if (!ctx) throw new Error('useBroadcastRegion must be used within BroadcastRegionProvider');
  return ctx;
}
