// A hype or rating an unauthenticated user entered before being asked to sign
// in. Stashed in sessionStorage so it survives the trip through the auth pages,
// then replayed by PendingFightActionResumer once the user lands authenticated.

export type PendingFightAction = {
  kind: 'hype' | 'rating';
  fightId: string;
  value: number;
  returnTo: string;
};

const KEY = 'pendingFightAction';

export function savePendingFightAction(action: PendingFightAction): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(action));
  } catch {
    // sessionStorage unavailable (private mode / SSR) — non-fatal
  }
}

export function readPendingFightAction(): PendingFightAction | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      (parsed?.kind === 'hype' || parsed?.kind === 'rating') &&
      typeof parsed.fightId === 'string' &&
      typeof parsed.value === 'number'
    ) {
      return parsed as PendingFightAction;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPendingFightAction(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // non-fatal
  }
}
