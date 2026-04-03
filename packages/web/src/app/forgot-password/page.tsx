'use client';

import { useState } from 'react';
import Link from 'next/link';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://fightcrewapp-backend.onrender.com/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center pt-20">
        <h2 className="mb-4 text-lg font-semibold">Check Your Email</h2>
        <p className="mb-4 text-center text-sm text-text-secondary">
          If an account exists for {email}, we&apos;ve sent a password reset link.
        </p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center pt-12">
      <h1 className="mb-6 text-2xl font-bold text-primary">GOOD FIGHTS</h1>
      <h2 className="mb-6 text-lg font-semibold">Reset Password</h2>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>
        )}
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary py-3 font-semibold text-text-on-accent transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <Link href="/login" className="mt-4 text-sm text-text-secondary hover:text-foreground">
        Back to sign in
      </Link>
    </div>
  );
}
