'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://fightcrewapp-backend.onrender.com/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token');
      return;
    }

    fetch(`${API_BASE_URL}/auth/verify-email?token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setStatus('success');
        setMessage('Your email has been verified!');
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.message || 'Verification failed');
      });
  }, [token]);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center pt-20">
      {status === 'loading' && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
      {status === 'success' && (
        <>
          <CheckCircle className="mb-4 text-success" size={48} />
          <h2 className="mb-2 text-lg font-semibold text-success">Email Verified</h2>
          <p className="mb-6 text-center text-sm text-text-secondary">{message}</p>
          <Link href="/login" className="rounded-lg bg-primary px-6 py-2 font-medium text-text-on-accent">
            Sign In
          </Link>
        </>
      )}
      {status === 'error' && (
        <>
          <XCircle className="mb-4 text-danger" size={48} />
          <h2 className="mb-2 text-lg font-semibold text-danger">Verification Failed</h2>
          <p className="mb-6 text-center text-sm text-text-secondary">{message}</p>
          <Link href="/login" className="text-sm text-primary hover:underline">
            Go to sign in
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
