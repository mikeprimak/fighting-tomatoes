import React, { createContext, useContext, useState, useCallback } from 'react';
import { VerificationRequiredModal } from '../components/VerificationRequiredModal';
import { useAuth } from './AuthContext';

interface VerificationContextType {
  /**
   * Check if user is verified. If not, shows the verification modal.
   * @param actionDescription - Description of the action (e.g., "rate this fight")
   * @returns true if user is verified, false if not (modal shown)
   */
  requireVerification: (actionDescription?: string) => boolean;

  /**
   * Check if user is verified without showing modal
   */
  isVerified: boolean;
}

const VerificationContext = createContext<VerificationContextType | undefined>(undefined);

export function VerificationProvider({ children }: { children: React.ReactNode }) {
  const { user, isGuest } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [actionDescription, setActionDescription] = useState<string>('perform this action');
  const [isGuestPrompt, setIsGuestPrompt] = useState(false);

  // Google/Apple sign-in users are auto-verified, email users need to verify
  // Guests are NOT verified (they need to create an account)
  const isVerified = !isGuest && (!user || user.isEmailVerified);

  const requireVerification = useCallback((description: string = 'perform this action'): boolean => {
    if (isGuest) {
      setActionDescription(description);
      setIsGuestPrompt(true);
      setModalVisible(true);
      return false;
    }

    if (isVerified) {
      return true;
    }

    setActionDescription(description);
    setIsGuestPrompt(false);
    setModalVisible(true);
    return false;
  }, [isVerified, isGuest]);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  return (
    <VerificationContext.Provider value={{ requireVerification, isVerified }}>
      {children}
      <VerificationRequiredModal
        visible={modalVisible}
        onClose={handleCloseModal}
        actionDescription={actionDescription}
        isGuest={isGuestPrompt}
      />
    </VerificationContext.Provider>
  );
}

export function useVerification() {
  const context = useContext(VerificationContext);
  if (context === undefined) {
    throw new Error('useVerification must be used within a VerificationProvider');
  }
  return context;
}
