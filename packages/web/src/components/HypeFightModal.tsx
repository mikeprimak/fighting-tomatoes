'use client';

import { useState, useEffect, useRef } from 'react';
import { Flame } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import {
  createFightPrediction,
  createPreFightComment,
  getFightPreFightComments,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

interface HypeFightModalProps {
  isOpen: boolean;
  onClose: () => void;
  fight: any;
  existingHype?: number;
}

const FLAME_SLOT_HEIGHT = 120;
const WHEEL_NUMBERS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export function HypeFightModal({ isOpen, onClose, fight, existingHype }: HypeFightModalProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [selectedHype, setSelectedHype] = useState<number | null>(existingHype ?? null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialCommentRef = useRef('');

  const { data: commentsData } = useQuery({
    queryKey: ['preFightComments', fight?.id],
    queryFn: () => getFightPreFightComments(fight.id),
    enabled: !!fight?.id && isAuthenticated && isOpen,
  });

  useEffect(() => {
    if (!isOpen) return;
    setSelectedHype(existingHype ?? null);
    setError('');
  }, [isOpen, existingHype, fight?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const existing = commentsData?.userComment?.content ?? '';
    setComment(existing);
    initialCommentRef.current = existing;
  }, [isOpen, commentsData?.userComment?.content]);

  if (!isOpen || !fight) return null;

  // Wheel position: each "slot" is FLAME_SLOT_HEIGHT tall. The 10 sits at the top
  // (offset 0), 9 at -1*h, …, 1 at -9*h, blank at -10*h. Negative translateY
  // brings the desired number into the window.
  const wheelOffset = selectedHype != null
    ? -(10 - selectedHype) * FLAME_SLOT_HEIGHT
    : -10 * FLAME_SLOT_HEIGHT;

  const persistChanges = async () => {
    const tasks: Promise<any>[] = [];
    if (selectedHype !== (existingHype ?? null)) {
      tasks.push(
        createFightPrediction(fight.id, {
          predictedRating: selectedHype ?? undefined,
        }),
      );
    }
    if (isAuthenticated) {
      const trimmed = comment.trim();
      if (trimmed !== initialCommentRef.current.trim()) {
        tasks.push(createPreFightComment(fight.id, trimmed));
      }
    }
    await Promise.all(tasks);
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['preFightComments', fight.id] });
    queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
  };

  const handleDone = async () => {
    setSaving(true);
    setError('');
    try {
      await persistChanges();
      onClose();
    } catch (err: any) {
      setError(err?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSeeComments = async () => {
    setSaving(true);
    setError('');
    try {
      await persistChanges();
      onClose();
      router.push(`/fights/${fight.id}`);
    } catch (err: any) {
      setError(err?.error || 'Failed to save');
      setSaving(false);
    }
  };

  const totalComments =
    commentsData?.comments?.reduce(
      (acc: number, c: any) => acc + 1 + (c.replies?.length || 0),
      0,
    ) ?? 0;

  const f1 = fight.fighter1 ?? {};
  const f2 = fight.fighter2 ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-border bg-background p-5 sm:rounded-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mb-4 text-center text-base font-bold uppercase tracking-wider text-foreground">
          How Hyped Are You?
        </h2>

        {/* Fighter row: image | lastName vs lastName | image */}
        <div className="mb-3 flex items-center justify-center gap-3">
          <FighterImage fighter={f1} />
          <div className="flex min-w-0 flex-col items-center text-center">
            <span className="max-w-[100px] truncate text-sm font-bold text-foreground">{f1.lastName}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">vs</span>
            <span className="max-w-[100px] truncate text-sm font-bold text-foreground">{f2.lastName}</span>
          </div>
          <FighterImage fighter={f2} />
        </div>

        {/* Flame wheel — one slot visible, transitions on selection */}
        <div
          className="relative mx-auto overflow-hidden"
          style={{ width: FLAME_SLOT_HEIGHT, height: FLAME_SLOT_HEIGHT }}
        >
          <div
            className="flex flex-col transition-transform duration-500 ease-out"
            style={{ transform: `translateY(${wheelOffset}px)` }}
          >
            {WHEEL_NUMBERS.map(n => {
              const color = getHypeHeatmapColor(n);
              return (
                <div
                  key={n}
                  className="relative flex shrink-0 items-center justify-center"
                  style={{ height: FLAME_SLOT_HEIGHT }}
                >
                  <Flame size={96} fill={color} color={color} strokeWidth={1.25} />
                  <span className="absolute inset-0 flex items-center justify-center pt-2 text-3xl font-bold text-white [text-shadow:_0_2px_4px_rgb(0_0_0_/_70%)]">
                    {n}
                  </span>
                </div>
              );
            })}
            {/* Blank/hollow flame for "no selection" */}
            <div
              className="flex shrink-0 items-center justify-center"
              style={{ height: FLAME_SLOT_HEIGHT }}
            >
              <Flame size={96} className="text-text-secondary/30" strokeWidth={1.25} />
            </div>
          </div>
        </div>

        {/* Row of clickable flames 1..10 */}
        <div className="mb-4 mt-2 flex items-center justify-between px-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(level => {
            const isSelected = selectedHype != null && level <= selectedHype;
            const color = isSelected ? getHypeHeatmapColor(level) : 'transparent';
            return (
              <button
                key={level}
                type="button"
                onClick={() => setSelectedHype(prev => (prev === level ? null : level))}
                className="flex h-9 w-7 items-center justify-center"
                aria-label={`Hype level ${level}`}
              >
                <Flame
                  size={26}
                  fill={isSelected ? color : 'transparent'}
                  color={isSelected ? color : '#808080'}
                  strokeWidth={1.5}
                />
              </button>
            );
          })}
        </div>

        {/* Comment input — auth only */}
        {isAuthenticated && (
          <div className="mb-4">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={selectedHype ? `Why are you ${selectedHype}/10 hyped?` : 'Why are you hyped?'}
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-card p-3 text-sm text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSeeComments}
              disabled={saving}
              className="mt-2 w-full text-center text-xs text-text-secondary hover:text-foreground disabled:opacity-50"
            >
              {totalComments > 0
                ? `See ${totalComments} ${totalComments === 1 ? 'Comment' : 'Comments'} >`
                : 'See Comments >'}
            </button>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 p-2 text-sm text-danger">{error}</div>
        )}

        <button
          onClick={handleDone}
          disabled={saving}
          className="w-full rounded-lg bg-primary py-3 text-sm font-bold uppercase tracking-wider text-text-on-accent transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>
    </div>
  );
}

function FighterImage({ fighter }: { fighter: any }) {
  const img = fighter?.profileImage || '';
  const initials = `${fighter?.firstName?.[0] ?? ''}${fighter?.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-card">
      {img ? (
        <img src={img} alt={`${fighter.firstName} ${fighter.lastName}`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-text-secondary">
          {initials}
        </div>
      )}
    </div>
  );
}
