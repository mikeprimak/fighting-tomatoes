import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/AuthContext';
import { Colors } from '../constants/Colors';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
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

  const handlePress = () => {
    router.push({
      pathname: '/(auth)/verify-email-pending',
      params: { email: user.email },
    });
  };

  const styles = createStyles(colors);

  return (
    <View style={[styles.outerContainer, { paddingTop: insets.top }]}>
      <TouchableOpacity style={styles.banner} onPress={handlePress}>
        <View style={styles.content}>
          <FontAwesome name="exclamation-circle" size={16} color="#fff" />
          <Text style={styles.text}>
            Verify your email to unlock all features
          </Text>
        </View>
        <FontAwesome name="chevron-right" size={14} color="#fff" />
      </TouchableOpacity>
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
    justifyContent: 'space-between',
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
