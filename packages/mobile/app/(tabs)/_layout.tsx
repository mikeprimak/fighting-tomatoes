import React from 'react';
import { useAuth } from '../../store/AuthContext';
import { Redirect } from 'expo-router';
import { FightingTomatoesTabBar } from '../../components';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return null;
  }

  // If user is not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <FightingTomatoesTabBar />;
}