'use client';

import { useState } from 'react';
import { sendFeedback } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import Link from 'next/link';

const FEEDBACK_TYPES = ['Bug Report', 'Feature Request', 'General Feedback', 'Other'];

export default function FeedbackPage() {
  const { isAuthenticated } = useAuth();
  const [type, setType] = useState('General Feedback');
  const [content, setContent] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError('');
    try {
      await sendFeedback({ content: content.trim(), type });
      setSent(true);
    } catch (err: any) {
      setError(err.error || 'Failed to send feedback');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md pt-20 text-center">
        <p className="text-text-secondary">
          <Link href="/login" className="text-primary hover:underline">Sign in</Link> to send feedback.
        </p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center pt-20">
        <MessageSquare className="mb-4 text-success" size={48} />
        <h2 className="mb-2 text-lg font-semibold text-success">Feedback Sent!</h2>
        <p className="mb-6 text-center text-sm text-text-secondary">Thank you for your feedback.</p>
        <Link href="/" className="text-sm text-primary hover:underline">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft size={14} />
        Back
      </Link>
      <h1 className="mb-6 text-xl font-bold">Send Feedback</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>
        )}

        <div>
          <label className="mb-2 block text-xs font-medium text-text-secondary">TYPE</label>
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  type === t ? 'bg-primary text-text-on-accent' : 'bg-card text-text-secondary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Tell us what you think..."
          rows={5}
          required
          className="w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
        />

        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="w-full rounded-lg bg-primary py-3 font-semibold text-text-on-accent transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Feedback'}
        </button>
      </form>
    </div>
  );
}
