import React, { createContext, useContext, useState, useCallback } from 'react';

interface PredictionAnimationContextType {
  pendingAnimationFightId: string | null;
  setPendingAnimation: (fightId: string | null) => void;
  pendingRatingAnimationFightId: string | null;
  setPendingRatingAnimation: (fightId: string | null) => void;
}

const PredictionAnimationContext = createContext<PredictionAnimationContextType | undefined>(undefined);

export function PredictionAnimationProvider({ children }: { children: React.ReactNode }) {
  const [pendingAnimationFightId, setPendingAnimationFightId] = useState<string | null>(null);
  const [pendingRatingAnimationFightId, setPendingRatingAnimationFightId] = useState<string | null>(null);

  const setPendingAnimation = useCallback((fightId: string | null) => {
    setPendingAnimationFightId(fightId);
  }, []);

  const setPendingRatingAnimation = useCallback((fightId: string | null) => {
    setPendingRatingAnimationFightId(fightId);
  }, []);

  return (
    <PredictionAnimationContext.Provider value={{
      pendingAnimationFightId,
      setPendingAnimation,
      pendingRatingAnimationFightId,
      setPendingRatingAnimation
    }}>
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
