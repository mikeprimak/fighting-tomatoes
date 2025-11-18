import React, { createContext, useContext, useState } from 'react';

interface NotificationContextType {
  preEventMessage: string | null;
  setPreEventMessage: (message: string | null) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [preEventMessage, setPreEventMessage] = useState<string | null>(null);

  return (
    <NotificationContext.Provider value={{ preEventMessage, setPreEventMessage }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
