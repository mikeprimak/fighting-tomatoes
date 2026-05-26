'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendFeedback } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MessageSquare, Send } from 'lucide-react';
import Link from 'next/link';

const MAX_CHARS = 5000;

export default function FeedbackPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Please enter your feedback');
      return;
    }
    if (trimmed.length < 10) {
      setError('Please provide more detailed feedback (at least 10 characters)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendFeedback({ content: trimmed, platform: 'web' });
      setSent(true);
    } catch (err: any) {
      setError(err?.error || 'Failed to submit feedback. Please try again.');
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
        <h2 className="mb-2 text-lg font-semibold text-success">Thank you for your feedback!</h2>
        <p className="mb-6 text-center text-sm text-text-secondary">
          Your feedback helps us improve the app for everyone. Thank you!
        </p>
        <Link href="/" className="text-sm text-primary hover:underline">Back to home</Link>
      </div>
    );
  }

  const charCount = content.length;

  return (
    <div className="mx-auto max-w-md">
      {/* Header — mirrors the mobile Send Feedback screen */}
      <div className="mb-8 flex flex-col items-center text-center">
        <MessageSquare className="text-primary" size={48} />
        <h1 className="mt-4 text-2xl font-bold text-foreground">We&apos;d love to hear from you!</h1>
        <p className="mt-2 px-6 text-sm text-text-secondary">
          Share your thoughts, suggestions, or report issues
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>
        )}

        <div>
          <label className="mb-2 block text-sm font-semibold text-foreground">Your Feedback</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Tell us what you think..."
            rows={10}
            maxLength={MAX_CHARS}
            required
            className="min-h-[200px] w-full resize-y rounded-lg border border-border bg-card px-4 py-3 text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-text-secondary">
            {charCount} / {MAX_CHARS} characters
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-semibold text-text-on-accent transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Send size={18} />
          {loading ? 'Submitting...' : 'Submit Feedback'}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="w-full rounded-lg border border-border py-3 font-semibold text-foreground transition-colors hover:bg-card disabled:opacity-50"
        >
          Cancel
        </button>

        <p className="pt-2 text-center text-xs italic text-text-secondary">
          Your feedback helps us improve the app for everyone. Thank you!
        </p>
      </form>
    </div>
  );
}
