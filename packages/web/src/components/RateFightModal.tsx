'use client';

import { useState, useEffect, useRef } from 'react';
import { Star } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import {
  rateFight,
  deleteFightRating,
  reviewFight,
  updateReview,
  updateFightUserData,
  getFightReviews,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AuthGatePrompt } from '@/components/AuthGatePrompt';

interface RateFightModalProps {
  isOpen: boolean;
  onClose: () => void;
  fight: any;
  existingRating?: number;
  existingReview?: { content: string; rating?: number; id?: string };
  /** Hide the "See Comments" link — used on the fight detail page, where it
   *  would just link to the page the user is already on. */
  hideCommentsLink?: boolean;
}

const WHEEL_SLOT_HEIGHT = 120;
const WHEEL_NUMBERS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export function RateFightModal({ isOpen, onClose, fight, existingRating, existingReview, hideCommentsLink }: RateFightModalProps) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [selectedRating, setSelectedRating] = useState<number | null>(existingRating ?? null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [authGate, setAuthGate] = useState(false);
  const initialCommentRef = useRef('');
  // Tracks whether the click that may close the modal *started* on the backdrop.
  // Prevents a close when the user presses inside the modal (e.g. selecting text
  // in the textarea) and releases the mouse outside it.
  const pressStartedOnBackdrop = useRef(false);

  const { data: reviewsData } = useQuery({
    queryKey: ['fightReviews', fight?.id],
    queryFn: () => getFightReviews(fight.id, { limit: 50 }),
    enabled: !!fight?.id && isAuthenticated && isOpen,
  });

  useEffect(() => {
    if (!isOpen) return;
    // Prefer the prop-passed rating; fall back to the rating attached to the
    // current user's own review if userRating didn't load onto the fight.
    const mineFromList =
      user?.id && reviewsData?.reviews
        ? reviewsData.reviews.find((r: any) => r.user?.id === user.id)
        : null;
    setSelectedRating(existingRating ?? mineFromList?.rating ?? null);
    setError('');
    setAuthGate(false);
  }, [isOpen, existingRating, fight?.id, reviewsData, user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    // Prefer prop-passed review (FightDetailClient), then fall back to the
    // current user's review pulled out of the reviews list.
    const propContent = existingReview?.content ?? '';
    const mineFromList =
      user?.id && reviewsData?.reviews
        ? reviewsData.reviews.find((r: any) => r.user?.id === user.id)
        : null;
    const existing = propContent || mineFromList?.content || '';
    setComment(existing);
    initialCommentRef.current = existing;
  }, [isOpen, existingReview?.content, reviewsData, user?.id]);

  if (!isOpen || !fight) return null;

  const wheelOffset = selectedRating != null
    ? -(10 - selectedRating) * WHEEL_SLOT_HEIGHT
    : -10 * WHEEL_SLOT_HEIGHT;

  const persistChanges = async () => {
    const tasks: Promise<any>[] = [];
    const ratingChanged = selectedRating !== (existingRating ?? null);
    if (ratingChanged) {
      if (selectedRating == null) {
        tasks.push(deleteFightRating(fight.id));
      } else {
        tasks.push(rateFight(fight.id, selectedRating));
      }
    }
    if (isAuthenticated) {
      const trimmed = comment.trim();
      const hadComment = !!initialCommentRef.current.trim();
      if (!trimmed && hadComment) {
        // The user cleared their comment → delete the review (rating untouched).
        tasks.push(updateFightUserData(fight.id, { review: null }));
      } else if (trimmed && trimmed !== initialCommentRef.current.trim() && selectedRating != null) {
        tasks.push(
          hadComment
            ? updateReview(fight.id, { content: trimmed, rating: selectedRating })
            : reviewFight(fight.id, { content: trimmed, rating: selectedRating }),
        );
      }
    }
    await Promise.all(tasks);
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['eventFights'] });
    queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
    queryClient.invalidateQueries({ queryKey: ['fightStats', fight.id] });
    queryClient.invalidateQueries({ queryKey: ['fightReviews', fight.id] });
    queryClient.invalidateQueries({ queryKey: ['topFights'] });
    queryClient.invalidateQueries({ queryKey: ['fighterFights'] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
    queryClient.invalidateQueries({ queryKey: ['myRatings'] });
  };

  const handleDone = async () => {
    if (!isAuthenticated) {
      setAuthGate(true);
      return;
    }
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
      if (isAuthenticated) await persistChanges();
      onClose();
      router.push(`/fights/${fight.id}`);
    } catch (err: any) {
      setError(err?.error || 'Failed to save');
      setSaving(false);
    }
  };

  const reviewCount = reviewsData?.pagination?.total ?? fight.reviewCount ?? 0;

  const f1 = fight.fighter1 ?? {};
  const f2 = fight.fighter2 ?? {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={e => { pressStartedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={e => {
        // Only close when both the press and the release happened on the
        // backdrop — a drag that ends outside the modal shouldn't close it.
        if (e.target === e.currentTarget && pressStartedOnBackdrop.current) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-background p-5"
        onClick={e => e.stopPropagation()}
      >
        {authGate ? (
          <AuthGatePrompt
            kind="rating"
            fightId={fight.id}
            value={selectedRating}
            onCancel={() => setAuthGate(false)}
          />
        ) : (
        <>
        <h2 className="mb-4 text-center text-base font-bold uppercase tracking-wider text-foreground">
          Rate This Fight
        </h2>

        {/* Fighter row */}
        <div className="mb-3 flex items-center justify-center gap-3">
          <FighterImage fighter={f1} />
          <div className="flex min-w-0 flex-col items-center text-center">
            <span className="max-w-[100px] truncate text-sm font-bold text-foreground">{f1.lastName}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">vs</span>
            <span className="max-w-[100px] truncate text-sm font-bold text-foreground">{f2.lastName}</span>
          </div>
          <FighterImage fighter={f2} />
        </div>

        {/* Star wheel */}
        <div
          className="relative mx-auto overflow-hidden"
          style={{ width: WHEEL_SLOT_HEIGHT, height: WHEEL_SLOT_HEIGHT }}
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
                  style={{ height: WHEEL_SLOT_HEIGHT }}
                >
                  <Star size={96} fill={color} color={color} strokeWidth={1.25} />
                  <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-white [text-shadow:_0_2px_4px_rgb(0_0_0_/_70%)]">
                    {n}
                  </span>
                </div>
              );
            })}
            <div
              className="flex shrink-0 items-center justify-center"
              style={{ height: WHEEL_SLOT_HEIGHT }}
            >
              <Star size={96} className="text-text-secondary/30" strokeWidth={1.25} />
            </div>
          </div>
        </div>

        {/* Row of clickable stars 1..10 */}
        <div className="mb-4 mt-2 flex items-center justify-between px-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(level => {
            const isSelected = selectedRating != null && level <= selectedRating;
            const color = isSelected ? getHypeHeatmapColor(level) : 'transparent';
            return (
              <button
                key={level}
                type="button"
                onClick={() => setSelectedRating(prev => (prev === level ? null : level))}
                className="flex h-9 w-7 items-center justify-center"
                aria-label={`Rating ${level}`}
              >
                <Star
                  size={26}
                  fill={isSelected ? color : 'transparent'}
                  color={isSelected ? color : '#808080'}
                  strokeWidth={1.5}
                />
              </button>
            );
          })}
        </div>

        {/* Comment composer (auth only) + See Comments link (always, unless on detail page) */}
        {(isAuthenticated || !hideCommentsLink) && (
          <div className="mb-4">
            {isAuthenticated && (
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={selectedRating ? `Why ${selectedRating}/10?` : 'What did you think?'}
                maxLength={1000}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-card p-3 text-sm text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
              />
            )}
            {!hideCommentsLink && (
              <button
                type="button"
                onClick={handleSeeComments}
                disabled={saving}
                className="mt-2 w-full text-center text-xs text-text-secondary hover:text-foreground disabled:opacity-50"
              >
                {reviewCount > 0
                  ? `See ${reviewCount} ${reviewCount === 1 ? 'Comment' : 'Comments'} >`
                  : 'See Comments >'}
              </button>
            )}
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
        </>
        )}
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
