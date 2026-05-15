'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '1082468109842-pehb7kkuclbv8g4acjba9eeeajprd8j7.apps.googleusercontent.com';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
            itp_support?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
  if (existing) {
    return new Promise(resolve => existing.addEventListener('load', () => resolve()));
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
}

export function GoogleSignInButton({
  mode = 'signin',
  redirectTo = '/',
}: {
  mode?: 'signin' | 'signup';
  redirectTo?: string;
}) {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadGisScript();
        if (cancelled || !containerRef.current || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async response => {
            try {
              await loginWithGoogle(response.credential);
              router.push(redirectTo);
            } catch (err) {
              const msg =
                err && typeof err === 'object' && 'error' in err
                  ? String((err as { error: unknown }).error)
                  : 'Google sign-in failed';
              setError(msg);
            }
          },
          ux_mode: 'popup',
          itp_support: true,
        });

        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Google Sign-In');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle, router, redirectTo, mode]);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div ref={containerRef} className="flex justify-center" />
      {error && (
        <div className="w-full rounded-lg border border-danger/30 bg-danger/10 p-2 text-center text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
