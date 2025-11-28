import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../store/AuthContext';

// Deep link handler: goodfights://resend-verification redirects to verification pending screen
export default function ResendVerificationRedirect() {
  const { user } = useAuth();

  useEffect(() => {
    router.replace({
      pathname: '/(auth)/verify-email-pending',
      params: { email: user?.email || '' },
    });
  }, [user?.email]);

  return null;
}
