'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface SpoilerFreeContextType {
  spoilerFreeMode: boolean;
  setSpoilerFreeMode: (val: boolean) => void;
}

const SpoilerFreeContext = createContext<SpoilerFreeContextType | undefined>(undefined);

export function SpoilerFreeProvider({ children }: { children: ReactNode }) {
  const [spoilerFreeMode, setSpoilerFreeMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('spoilerFreeMode') === 'true';
    }
    return false;
  });

  const handleSet = (val: boolean) => {
    setSpoilerFreeMode(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('spoilerFreeMode', String(val));
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
