import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

export type AlertType = 'success' | 'error' | 'info' | 'warning' | 'confirm';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
  visible: boolean;
  type?: AlertType;
  title?: string;
  message: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
  autoHideDuration?: number; // Auto-hide after ms (for success/info messages)
}

export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  type = 'info',
  title,
  message,
  buttons,
  onDismiss,
  autoHideDuration,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Auto-hide for simple alerts
  React.useEffect(() => {
    if (visible && autoHideDuration && !buttons) {
      const timer = setTimeout(() => {
        onDismiss?.();
      }, autoHideDuration);
      return () => clearTimeout(timer);
    }
  }, [visible, autoHideDuration, onDismiss, buttons]);

  const getIconConfig = () => {
    switch (type) {
      case 'success':
        return { name: 'check-circle' as const, color: '#10b981' };
      case 'error':
        return { name: 'times-circle' as const, color: colors.danger };
      case 'warning':
        return { name: 'exclamation-triangle' as const, color: '#f59e0b' };
      case 'confirm':
        return { name: 'question-circle' as const, color: colors.tint };
      default:
        return { name: 'info-circle' as const, color: colors.tint };
    }
  };

  const icon = getIconConfig();

  // Simple alert (success/error/info) - no buttons
  const isSimpleAlert = !buttons || buttons.length === 0;

  // Handle button press
  const handleButtonPress = (button: AlertButton) => {
    button.onPress?.();
    onDismiss?.();
  };

  if (isSimpleAlert) {
    // Simple alert with just icon and message (auto-dismiss)
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onDismiss}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={onDismiss}
        >
          <TouchableOpacity
            style={[styles.simpleContainer, { backgroundColor: colors.card }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <FontAwesome name={icon.name} size={64} color={icon.color} />
            {title && (
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            )}
            <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }

  // Confirmation alert with buttons
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onDismiss}
      >
        <TouchableOpacity
          style={[styles.confirmContainer, { backgroundColor: colors.card }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.iconHeader}>
            <FontAwesome name={icon.name} size={48} color={icon.color} />
          </View>

          {title && (
            <Text style={[styles.confirmTitle, { color: colors.text }]}>{title}</Text>
          )}
          <Text style={[styles.confirmMessage, { color: colors.textSecondary }]}>
            {message}
          </Text>

          <View style={styles.buttonContainer}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.button,
                  { borderTopColor: colors.border },
                  index > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border },
                ]}
                onPress={() => handleButtonPress(button)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color:
                        button.style === 'destructive'
                          ? colors.danger
                          : button.style === 'cancel'
                          ? colors.textSecondary
                          : colors.tint,
                      fontWeight: button.style === 'cancel' ? '500' : 'bold',
                    },
                  ]}
                >
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // Simple alert styles (success/info/error toast-style)
  simpleContainer: {
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
  },
  // Confirmation alert styles
  confirmContainer: {
    borderRadius: 12,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  iconHeader: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  confirmMessage: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
  },
});
