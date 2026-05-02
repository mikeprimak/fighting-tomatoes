import React, { createContext, useCallback, useContext, useState } from 'react';
import { ReviewPromptModal } from '../components/ReviewPromptModal';
import { markShown, openNativeReviewSheet, shouldAsk } from '../services/reviewPrompt';

type ReviewPromptContextValue = {
  requestPrompt: () => Promise<void>;
};

const ReviewPromptContext = createContext<ReviewPromptContextValue | null>(null);

export function ReviewPromptProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  const requestPrompt = useCallback(async () => {
    if (visible) return;
    if (!(await shouldAsk())) return;
    setVisible(true);
  }, [visible]);

  const handleRateNow = useCallback(async () => {
    await markShown();
    setVisible(false);
    await openNativeReviewSheet();
  }, []);

  const handleMaybeLater = useCallback(async () => {
    await markShown();
    setVisible(false);
  }, []);

  return (
    <ReviewPromptContext.Provider value={{ requestPrompt }}>
      {children}
      <ReviewPromptModal
        visible={visible}
        onRateNow={handleRateNow}
        onMaybeLater={handleMaybeLater}
      />
    </ReviewPromptContext.Provider>
  );
}

export function useReviewPrompt(): ReviewPromptContextValue {
  const ctx = useContext(ReviewPromptContext);
  if (!ctx) throw new Error('useReviewPrompt must be used within ReviewPromptProvider');
  return ctx;
}
