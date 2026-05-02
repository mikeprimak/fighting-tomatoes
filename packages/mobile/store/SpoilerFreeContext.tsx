import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
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
  const colors = Colors.dark;
  const [spoilerFreeMode, setSpoilerFreeModeState] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'true') setSpoilerFreeModeState(true);
    });
    shouldShowSpoilerOnboarding().then((show) => {
      if (show) setOnboardingVisible(true);
    });
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(20);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    toastTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: 20, duration: 250, useNativeDriver: true }),
      ]).start(() => setToastMessage(''));
    }, 2200);
  };

  const setSpoilerFreeMode = (enabled: boolean) => {
    setSpoilerFreeModeState((prev) => {
      if (prev !== enabled) {
        showToast(enabled ? 'Spoiler-free mode on' : 'Spoiler-free mode off');
      }
      return enabled;
    });
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
      {toastMessage ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <Text style={[styles.toastText, { color: colors.text }]}>{toastMessage}</Text>
        </Animated.View>
      ) : null}
    </SpoilerFreeContext.Provider>
  );
}

export function useSpoilerFree() {
  return useContext(SpoilerFreeContext);
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: '80%',
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
