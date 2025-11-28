import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../../store/AuthContext';
import { Redirect } from 'expo-router';
import { FightCrewAppTabBar } from '../../components';
import { VerificationBanner } from '../../components/VerificationBanner';

export default function TabLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return null;
  }

  // If user is not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  const showBanner = !!(user && !user.isEmailVerified);

  return (
    <View style={styles.container}>
      {/* Show verification banner if user email is not verified */}
      {showBanner && <VerificationBanner />}
      <View style={styles.tabContainer}>
        <FightCrewAppTabBar skipHeaderSafeArea={showBanner} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flex: 1,
  },
});