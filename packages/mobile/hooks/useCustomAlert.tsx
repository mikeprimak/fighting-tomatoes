import { useState, useCallback } from 'react';
import { AlertButton, AlertType } from '../components/CustomAlert';

interface AlertState {
  visible: boolean;
  type: AlertType;
  title?: string;
  message: string;
  buttons?: AlertButton[];
  autoHideDuration?: number;
}

export const useCustomAlert = () => {
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    type: 'info',
    message: '',
    buttons: undefined,
  });

  const showAlert = useCallback(
    (
      message: string,
      title?: string,
      type: AlertType = 'info',
      buttons?: AlertButton[],
      autoHideDuration?: number
    ) => {
      setAlertState({
        visible: true,
        type,
        title,
        message,
        buttons,
        autoHideDuration,
      });
    },
    []
  );

  // Convenience methods
  const showSuccess = useCallback((message: string, title?: string) => {
    showAlert(message, title, 'success', undefined, 1500);
  }, [showAlert]);

  const showError = useCallback((message: string, title?: string) => {
    showAlert(message, title, 'error', undefined, 2500);
  }, [showAlert]);

  const showInfo = useCallback((message: string, title?: string) => {
    showAlert(message, title, 'info', undefined, 2000);
  }, [showAlert]);

  const showConfirm = useCallback(
    (
      message: string,
      onConfirm: () => void,
      title?: string,
      confirmText: string = 'Confirm',
      cancelText: string = 'Cancel',
      destructive: boolean = false
    ) => {
      showAlert(message, title, 'confirm', [
        {
          text: cancelText,
          style: 'cancel',
        },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: onConfirm,
        },
      ]);
    },
    [showAlert]
  );

  const hideAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    alertState,
    showAlert,
    showSuccess,
    showError,
    showInfo,
    showConfirm,
    hideAlert,
  };
};
