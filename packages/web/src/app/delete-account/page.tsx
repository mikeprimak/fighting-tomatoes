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
      <div className="mx-auto max-w-md pt-20 text-center">
        <p className="text-text-secondary">You must be signed in to delete your account.</p>
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
