import React, { createContext, useContext, useState, useCallback } from 'react';

interface PredictionAnimationContextType {
  pendingAnimationFightId: string | null;
  setPendingAnimation: (fightId: string | null) => void;
}

const PredictionAnimationContext = createContext<PredictionAnimationContextType | undefined>(undefined);

export function PredictionAnimationProvider({ children }: { children: React.ReactNode }) {
  const [pendingAnimationFightId, setPendingAnimationFightId] = useState<string | null>(null);

  const setPendingAnimation = useCallback((fightId: string | null) => {
    setPendingAnimationFightId(fightId);
  }, []);

  return (
    <PredictionAnimationContext.Provider value={{ pendingAnimationFightId, setPendingAnimation }}>
      {children}
    </PredictionAnimationContext.Provider>
  );
}

export function usePredictionAnimation() {
  const context = useContext(PredictionAnimationContext);
  if (context === undefined) {
    throw new Error('usePredictionAnimation must be used within PredictionAnimationProvider');
  }
  return context;
}
