'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';

interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  existingContent?: string;
  submitLabel?: string;
}

export function CommentForm({ onSubmit, placeholder = 'Write a comment...', existingContent, submitLabel = 'Post' }: CommentFormProps) {
  const { isAuthenticated } = useAuth();
  const [content, setContent] = useState(existingContent || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-center text-sm text-text-secondary">
        <Link href="/login" className="text-primary hover:underline">Sign in</Link> to leave a comment.
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit(content.trim());
      if (!existingContent) setContent('');
    } catch (err: any) {
      setError(err.error || 'Failed to post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-3">
      {error && (
        <div className="mb-2 rounded-lg border border-danger/30 bg-danger/10 p-2 text-xs text-danger">{error}</div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving || !content.trim()}
          className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-on-accent transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Send size={14} />
          {saving ? '...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
