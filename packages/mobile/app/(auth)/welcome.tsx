import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { AppleSignInButton } from '../../components/AppleSignInButton';

export default function WelcomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const features = [
    { icon: 'star', text: 'Rate every UFC fight from 1-10' },
    { icon: 'trophy', text: 'Predict winners and earn points' },
    { icon: 'user-friends', text: 'Follow your favorite fighters' },
    { icon: 'users', text: 'Join crews and compete with friends' },
  ];

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo and Tagline */}
        <View style={styles.header}>
          <Image source={require('../../assets/app-icon-internal.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.appName}>Good Fights</Text>
          <Text style={styles.tagline}>Rate Fights. Predict Winners. Join Crews.</Text>
        </View>

        {/* Feature List */}
        <View style={styles.features}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <FontAwesome5 name={feature.icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA Buttons */}
        <View style={styles.buttons}>
          {/* Apple Sign-In Button (only shows on iOS) */}
          <AppleSignInButton mode="signup" />

          {/* Google Sign-In Button */}
          <GoogleSignInButton mode="signup" />

          {/* Email Sign-Up Button */}
          <TouchableOpacity
            style={styles.emailButton}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.emailButtonText}>Sign up with Email</Text>
          </TouchableOpacity>
        </View>

        {/* Sign In Link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.signInLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 12,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  features: {
    marginBottom: 40,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureText: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  buttons: {
    gap: 12,
    marginBottom: 24,
  },
  emailButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    minHeight: 52,
  },
  emailButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  signInLink: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
});
