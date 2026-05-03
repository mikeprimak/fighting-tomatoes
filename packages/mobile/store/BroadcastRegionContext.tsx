import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, type BroadcastRegion } from '../services/api';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'broadcastRegionOverride';

interface BroadcastRegionContextType {
  /** User-set region override. null means "auto-detect" (server-side IP / fallback). */
  region: BroadcastRegion | null;
  /** Set the region. Persists to AsyncStorage and to the user record (if signed in). */
  setRegion: (region: BroadcastRegion | null) => Promise<void>;
}

const BroadcastRegionContext = createContext<BroadcastRegionContextType>({
  region: null,
  setRegion: async () => {},
});

export function BroadcastRegionProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegionState] = useState<BroadcastRegion | null>(null);
  const { user, isAuthenticated } = useAuth();

  // Hydrate: prefer the authenticated user's stored value, otherwise the local override.
  useEffect(() => {
    (async () => {
      const userRegion = (user as any)?.broadcastRegion as BroadcastRegion | null | undefined;
      if (userRegion) {
        setRegionState(userRegion);
        return;
      }
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored && stored !== 'null') {
        setRegionState(stored as BroadcastRegion);
      } else {
        setRegionState(null);
      }
    })();
  }, [user]);

  const setRegion = useCallback(async (next: BroadcastRegion | null) => {
    setRegionState(next);
    try {
      if (next) {
        await AsyncStorage.setItem(STORAGE_KEY, next);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('[BroadcastRegion] AsyncStorage failed:', e);
    }
    if (isAuthenticated) {
      try {
        await api.setBroadcastRegion(next);
      } catch (e) {
        console.warn('[BroadcastRegion] failed to persist to backend:', e);
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
  return useContext(BroadcastRegionContext);
}
