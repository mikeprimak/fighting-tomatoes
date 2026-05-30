'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { deleteAccount } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

export default function DeleteAccountPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="mb-6 flex items-center gap-3">
          <AlertTriangle className="text-danger" size={24} />
          <h1 className="text-xl font-bold text-danger">Delete Your Good Fights Account</h1>
        </div>

        <div className="space-y-4 text-sm text-text-secondary">
          <p>
            You can request deletion of your Good Fights account and all associated data at any time.
            You do not need to download the app to do this.
          </p>

          <h2 className="text-lg font-semibold text-foreground">How to delete your account</h2>
          <ul className="list-inside list-disc space-y-2">
            <li>
              <span className="font-semibold text-foreground">From the web:</span> Sign in to{' '}
              <a href="/login" className="text-primary hover:underline">goodfights.app</a> and return to this
              page to permanently delete your account immediately.
            </li>
            <li>
              <span className="font-semibold text-foreground">From the mobile app:</span> Go to Settings →
              Advanced Settings → Delete Account.
            </li>
            <li>
              <span className="font-semibold text-foreground">By email:</span> Email{' '}
              <a href="mailto:privacy@goodfights.app" className="text-primary hover:underline">privacy@goodfights.app</a>{' '}
              from the address on your account and we will delete it within 30 days.
            </li>
          </ul>

          <h2 className="text-lg font-semibold text-foreground">What gets deleted</h2>
          <p>Deleting your account permanently removes all data associated with it, including:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Your account and profile information (email, display name)</li>
            <li>All your ratings and reviews</li>
            <li>All your hype scores</li>
            <li>All your comments</li>
          </ul>
          <p>
            This action is permanent and cannot be undone. We do not retain any personal data after deletion,
            except where required by law.
          </p>

          <p className="pt-2">
            <a href="/login" className="text-primary hover:underline">Sign in to delete your account →</a>
          </p>
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    if (confirmation !== 'DELETE') return;
    setLoading(true);
    setError('');
    try {
      await deleteAccount(confirmation);
      await logout();
      router.push('/');
    } catch (err: any) {
      setError(err.error || 'Failed to delete account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pt-12">
      <div className="mb-6 flex items-center gap-3">
        <AlertTriangle className="text-danger" size={24} />
        <h1 className="text-xl font-bold text-danger">Delete Account</h1>
      </div>

      <div className="mb-6 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-text-secondary">
        <p className="mb-2 font-semibold text-danger">This action is permanent and cannot be undone.</p>
        <p>Deleting your account will permanently remove:</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>All your ratings and reviews</li>
          <li>All your hype scores</li>
          <li>All your comments</li>
          <li>Your profile information</li>
        </ul>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>
      )}

      <p className="mb-2 text-sm text-text-secondary">
        Type <span className="font-mono font-semibold text-danger">DELETE</span> to confirm:
      </p>
      <input
        type="text"
        value={confirmation}
        onChange={e => setConfirmation(e.target.value)}
        placeholder="DELETE"
        className="mb-4 w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground focus:border-danger focus:outline-none"
      />
      <button
        onClick={handleDelete}
        disabled={confirmation !== 'DELETE' || loading}
        className="w-full rounded-lg bg-danger py-3 font-semibold text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
      >
        {loading ? 'Deleting...' : 'Permanently Delete Account'}
      </button>
    </div>
  );
}
