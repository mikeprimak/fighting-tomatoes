import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
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
    <TouchableOpacity style={styles.banner} onPress={handlePress}>
      <View style={styles.content}>
        <FontAwesome name="exclamation-circle" size={18} color="#92400e" />
        <Text style={styles.text}>
          Verify your email to unlock all features
        </Text>
      </View>
      <FontAwesome name="chevron-right" size={14} color="#92400e" />
    </TouchableOpacity>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  banner: {
    backgroundColor: '#fef3c7', // Yellow/amber background
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  text: {
    color: '#92400e', // Amber text
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
});

export default VerificationBanner;
