import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'spoilerFreeMode';

interface SpoilerFreeContextType {
  spoilerFreeMode: boolean;
  setSpoilerFreeMode: (enabled: boolean) => void;
}

const SpoilerFreeContext = createContext<SpoilerFreeContextType>({
  spoilerFreeMode: false,
  setSpoilerFreeMode: () => {},
});

export function SpoilerFreeProvider({ children }: { children: React.ReactNode }) {
  const [spoilerFreeMode, setSpoilerFreeModeState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'true') setSpoilerFreeModeState(true);
    });
  }, []);

  const setSpoilerFreeMode = (enabled: boolean) => {
    setSpoilerFreeModeState(enabled);
    AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  };

  return (
    <SpoilerFreeContext.Provider value={{ spoilerFreeMode, setSpoilerFreeMode }}>
      {children}
    </SpoilerFreeContext.Provider>
  );
}

export function useSpoilerFree() {
  return useContext(SpoilerFreeContext);
}
