import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../../store/AuthContext';
import { Redirect } from 'expo-router';
import { FightCrewAppTabBar } from '../../components';
import { VerificationBanner } from '../../components/VerificationBanner';

export default function TabLayout() {
  const { isAuthenticated, isLoading, user, isGuest } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return null;
  }

  // Allow access if authenticated OR guest
  if (!isAuthenticated && !isGuest) {
    return <Redirect href="/(auth)/welcome" />;
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