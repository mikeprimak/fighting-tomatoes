import { useEffect } from 'react';
import { router } from 'expo-router';

// Deep link handler: goodfights://home redirects to main tabs
export default function HomeRedirect() {
  useEffect(() => {
    router.replace('/(tabs)');
  }, []);

  return null;
}
