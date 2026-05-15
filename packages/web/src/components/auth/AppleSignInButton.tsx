'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID || 'app.goodfights.web';

const APPLE_JS_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

type AppleAuthResponse = {
  authorization: {
    id_token: string;
    code: string;
    state?: string;
  };
  user?: {
    name?: { firstName?: string; lastName?: string };
    email?: string;
  };
};

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          state?: string;
          nonce?: string;
          usePopup?: boolean;
        }) => void;
        signIn: () => Promise<AppleAuthResponse>;
      };
    };
  }
}

function loadAppleScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.AppleID?.auth) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_JS_SRC}"]`);
  if (existing) {
    return new Promise(resolve => existing.addEventListener('load', () => resolve()));
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = APPLE_JS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Sign in with Apple JS'));
    document.head.appendChild(s);
  });
}

export function AppleSignInButton({
  mode = 'signin',
  redirectTo = '/',
}: {
  mode?: 'signin' | 'signup';
  redirectTo?: string;
}) {
  const { loginWithApple } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadAppleScript();
        if (cancelled || !window.AppleID) return;
        window.AppleID.auth.init({
          clientId: APPLE_SERVICES_ID,
          scope: 'name email',
          redirectURI:
            typeof window !== 'undefined'
              ? `${window.location.origin}/login`
              : 'https://web-jet-gamma-12.vercel.app/login',
          usePopup: true,
        });
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Apple Sign-In');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = async () => {
    if (!window.AppleID?.auth) {
      setError('Apple Sign-In not ready');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await window.AppleID.auth.signIn();
      const identityToken = result.authorization?.id_token;
      if (!identityToken) {
        setError('No identity token received from Apple');
        return;
      }
      await loginWithApple({
        identityToken,
        email: result.user?.email,
        firstName: result.user?.name?.firstName,
        lastName: result.user?.name?.lastName,
      });
      router.push(redirectTo);
    } catch (err: unknown) {
      const obj = err as { error?: string };
      if (obj?.error === 'popup_closed_by_user' || obj?.error === 'user_cancelled_authorize') {
        // user cancelled — silent
        return;
      }
      const msg =
        obj?.error ||
        (err instanceof Error ? err.message : null) ||
        'Apple sign-in failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={!ready || loading}
        className="flex h-10 w-[320px] items-center justify-center gap-2 rounded-md bg-black text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        aria-label={mode === 'signup' ? 'Sign up with Apple' : 'Sign in with Apple'}
      >
        <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
          <path d="M13.06 10.6c-.02-2.06 1.69-3.05 1.77-3.1-.96-1.4-2.46-1.59-2.99-1.62-1.27-.13-2.48.75-3.13.75-.65 0-1.65-.73-2.71-.71-1.4.02-2.69.81-3.41 2.06-1.45 2.52-.37 6.26 1.04 8.32.69 1 1.51 2.13 2.58 2.09 1.03-.04 1.43-.67 2.68-.67 1.25 0 1.6.67 2.69.65 1.11-.02 1.81-1.03 2.49-2.04.79-1.18 1.12-2.32 1.13-2.38-.02-.01-2.16-.83-2.18-3.3zM11.04 4.4c.57-.69.95-1.65.85-2.6-.82.03-1.81.55-2.4 1.24-.53.61-1 1.59-.87 2.53.91.07 1.85-.46 2.42-1.17z" />
        </svg>
        <span>{mode === 'signup' ? 'Sign up with Apple' : 'Sign in with Apple'}</span>
      </button>
      {error && (
        <div className="w-full rounded-lg border border-danger/30 bg-danger/10 p-2 text-center text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
