'use client';

import { useRouter } from 'next/navigation';
import { savePendingFightAction } from '@/lib/pendingFightAction';

interface AuthGatePromptProps {
  kind: 'hype' | 'rating';
  fightId: string;
  /** The value the user entered, if any — stashed so it saves after sign-in. */
  value: number | null;
  onCancel: () => void;
}

export function AuthGatePrompt({ kind, fightId, value, onCancel }: AuthGatePromptProps) {
  const router = useRouter();
  const label = kind === 'hype' ? 'hype' : 'rating';

  const go = (path: '/register' | '/login') => {
    const returnTo = window.location.pathname + window.location.search;
    if (value != null) {
      savePendingFightAction({ kind, fightId, value, returnTo });
    }
    router.push(`${path}?redirect=${encodeURIComponent(returnTo)}`);
  };

  return (
    <div className="text-center">
      <h2 className="mb-2 text-base font-bold uppercase tracking-wider text-foreground">
        Save your {label}
      </h2>
      <p className="mb-5 text-sm leading-relaxed text-text-secondary">
        {`Sign up or log in to save your ${label} and build your fan profile. We'll bring you right back.`}
      </p>
      <button
        onClick={() => go('/register')}
        className="w-full rounded-lg bg-primary py-3 text-sm font-bold uppercase tracking-wider text-text-on-accent transition-colors hover:bg-primary/90"
      >
        Create account
      </button>
      <button
        onClick={() => go('/login')}
        className="mt-3 w-full rounded-lg border border-border py-3 text-sm font-semibold text-foreground transition-colors hover:bg-card"
      >
        Sign in
      </button>
      <button
        onClick={onCancel}
        className="mt-3 w-full text-xs text-text-secondary hover:text-foreground"
      >
        Not now
      </button>
    </div>
  );
}
