import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Image,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { useColorScheme } from 'react-native';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

interface GoogleSignInButtonProps {
  mode?: 'signin' | 'signup';
  onError?: (error: string) => void;
}

export function GoogleSignInButton({ mode = 'signin', onError }: GoogleSignInButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { signInWithGoogle, isLoading, error, isReady } = useGoogleAuth();

  React.useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  const buttonText = mode === 'signup'
    ? 'Sign up with Google'
    : 'Continue with Google';

  const styles = createStyles(colors);

  return (
    <TouchableOpacity
      style={[styles.button, !isReady && styles.buttonDisabled]}
      onPress={signInWithGoogle}
      disabled={!isReady || isLoading}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.content}>
          <Image
            source={{ uri: 'https://www.google.com/favicon.ico' }}
            style={styles.icon}
          />
          <Text style={styles.text}>{buttonText}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  button: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});

export default GoogleSignInButton;
