import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/AuthContext';
import { Colors } from '../constants/Colors';
import { FontAwesome } from '@expo/vector-icons';

interface VerificationBannerProps {
  onDismiss?: () => void;
}

export function VerificationBanner({ onDismiss }: VerificationBannerProps) {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  // Don't show if user is verified or not logged in
  if (!user || user.isEmailVerified) {
    return null;
  }

  const styles = createStyles(colors);

  return (
    <View style={[styles.outerContainer, { paddingTop: insets.top }]}>
      <View style={styles.banner}>
        <View style={styles.content}>
          <FontAwesome name="exclamation-circle" size={16} color="#fff" />
          <Text style={styles.text}>
            Verify your email to unlock all features
          </Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  outerContainer: {
    backgroundColor: '#202020', // Lighter grey - same as page headers (colors.card)
  },
  banner: {
    backgroundColor: '#166534', // Green background for message
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
});

export default VerificationBanner;
