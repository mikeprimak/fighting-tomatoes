import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../store/AuthContext';
import { VerificationProvider } from '../store/VerificationContext';
import { PredictionAnimationProvider } from '../store/PredictionAnimationContext';
import { NotificationProvider } from '../store/NotificationContext';
import { SearchProvider } from '../store/SearchContext';
import { OrgFilterProvider } from '../store/OrgFilterContext';
import { Colors } from '../constants/Colors';
import { NotificationHandler } from '../components/NotificationHandler';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Create a client for React Query
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // Keep cached data for 10 minutes
      refetchOnWindowFocus: false, // Don't refetch when app regains focus
      refetchOnMount: false, // Don't refetch when component mounts if data exists
      refetchOnReconnect: false, // Don't refetch on network reconnect
    },
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // Note: SpaceMono font removed for now
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Custom navigation themes that match app colors
  const customLightTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  const customDarkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VerificationProvider>
          <PredictionAnimationProvider>
            <NotificationProvider>
              <SearchProvider>
              <OrgFilterProvider>
              <ThemeProvider value={colorScheme === 'dark' ? customDarkTheme : customLightTheme}>
                <StatusBar style="light" />
                <NotificationHandler />
              <Stack
                screenOptions={{
                  contentStyle: { backgroundColor: colors.background },
                  animation: 'none',
                  headerStyle: {
                    backgroundColor: colors.card,
                  },
                  // Hide the back button text on iOS (shows just the chevron)
                  headerBackTitleVisible: false,
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="activity" options={{ headerShown: false }} />
                <Stack.Screen name="crew/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="crew/info/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="fight" options={{ headerShown: false }} />
                <Stack.Screen name="fighter" options={{ headerShown: false }} />
                <Stack.Screen name="event" options={{ headerShown: false }} />
                <Stack.Screen
                  name="search-results"
                  options={{
                    title: 'Search Results',
                    headerShown: true,
                    headerTintColor: colors.text,
                    headerTitleStyle: { color: colors.text }
                  }}
                />
                </Stack>
              </ThemeProvider>
              </OrgFilterProvider>
              </SearchProvider>
            </NotificationProvider>
          </PredictionAnimationProvider>
        </VerificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}