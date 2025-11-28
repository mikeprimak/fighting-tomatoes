import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useColorScheme } from 'react-native';
import { useAppleAuth } from '../hooks/useAppleAuth';

interface AppleSignInButtonProps {
  mode?: 'signin' | 'signup';
  onError?: (error: string) => void;
}

export function AppleSignInButton({ mode = 'signin', onError }: AppleSignInButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { signInWithApple, isLoading, error, isAvailable } = useAppleAuth();

  React.useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // Only render on iOS and when available
  if (Platform.OS !== 'ios' || !isAvailable) {
    return null;
  }

  const buttonText = mode === 'signup'
    ? 'Sign up with Apple'
    : 'Continue with Apple';

  const isDarkMode = colorScheme === 'dark';
  const styles = createStyles(colors, isDarkMode);

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={signInWithApple}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator color={isDarkMode ? '#000' : '#fff'} />
      ) : (
        <View style={styles.content}>
          <FontAwesome
            name="apple"
            size={20}
            color={isDarkMode ? '#000' : '#fff'}
            style={styles.icon}
          />
          <Text style={styles.text}>{buttonText}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: any, isDarkMode: boolean) => StyleSheet.create({
  button: {
    // Apple Sign-In button guidelines: white on dark, black on light
    backgroundColor: isDarkMode ? '#fff' : '#000',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 52,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: 12,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: isDarkMode ? '#000' : '#fff',
  },
});

export default AppleSignInButton;
