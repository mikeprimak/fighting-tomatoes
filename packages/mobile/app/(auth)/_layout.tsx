import { Stack } from 'expo-router';
import { useAuth } from '../../store/AuthContext';
import { Redirect } from 'expo-router';

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return null; // You could show a loading screen here
  }

  // If user is already authenticated, redirect to main app
  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify-email-pending" />
      <Stack.Screen name="verify-email-success" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="welcome" />
    </Stack>
  );
}