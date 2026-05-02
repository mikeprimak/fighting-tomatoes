import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpoilerOnboardingModal } from '../components/SpoilerOnboardingModal';
import {
  markSpoilerOnboardingShown,
  shouldShowSpoilerOnboarding,
} from '../services/spoilerOnboarding';

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
  const [onboardingVisible, setOnboardingVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'true') setSpoilerFreeModeState(true);
    });
    shouldShowSpoilerOnboarding().then((show) => {
      if (show) setOnboardingVisible(true);
    });
  }, []);

  const setSpoilerFreeMode = (enabled: boolean) => {
    setSpoilerFreeModeState(enabled);
    AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  };

  const handleHideResults = () => {
    setSpoilerFreeMode(true);
    setOnboardingVisible(false);
    markSpoilerOnboardingShown().catch(() => {});
  };

  const handleShowResults = () => {
    setSpoilerFreeMode(false);
    setOnboardingVisible(false);
    markSpoilerOnboardingShown().catch(() => {});
  };

  return (
    <SpoilerFreeContext.Provider value={{ spoilerFreeMode, setSpoilerFreeMode }}>
      {children}
      <SpoilerOnboardingModal
        visible={onboardingVisible}
        onHideResults={handleHideResults}
        onShowResults={handleShowResults}
      />
    </SpoilerFreeContext.Provider>
  );
}

export function useSpoilerFree() {
  return useContext(SpoilerFreeContext);
}
