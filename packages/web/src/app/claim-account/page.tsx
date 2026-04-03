'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://fightcrewapp-backend.onrender.com/api';

function ClaimAccountForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/claim-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Claim failed');
      }
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Failed to claim account');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center pt-20">
        <p className="text-text-secondary">Invalid or missing claim token.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center pt-20">
        <h2 className="mb-4 text-lg font-semibold text-success">Account Claimed!</h2>
        <p className="mb-4 text-center text-sm text-text-secondary">You can now sign in with your password.</p>
        <Link href="/login" className="rounded-lg bg-primary px-6 py-2 font-medium text-text-on-accent">Sign In</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center pt-12">
      <h1 className="mb-6 text-2xl font-bold text-primary">GOOD FIGHTS</h1>
      <h2 className="mb-6 text-lg font-semibold">Claim Your Account</h2>
      <p className="mb-6 text-center text-sm text-text-secondary">Set a password to claim your account.</p>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>
        )}
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={8}
          className="w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          placeholder="Confirm Password"
          required
          className="w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary py-3 font-semibold text-text-on-accent transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Claiming...' : 'Claim Account'}
        </button>
      </form>
    </div>
  );
}

export default function ClaimAccountPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <ClaimAccountForm />
    </Suspense>
  );
}
