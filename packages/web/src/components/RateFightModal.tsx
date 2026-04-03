'use client';

import { useState } from 'react';
import { X, Star } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { rateFight, reviewFight, updateReview, applyFightTags } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

const FIGHT_TAGS = [
  // Quality
  'Masterpiece', 'Legendary', 'Instant Classic', 'FOTY Contender', 'FOTN', 'Exciting', 'Solid', 'Decent', 'Disappointing', 'Terrible',
  // Emotion
  'Epic', 'Spectacular', 'Thrilling', 'Emotional', 'Inspiring', 'Heartbreaking', 'Shocking', 'Flat', 'Boring',
  // Style
  'War', 'Technical', 'Striking Clinic', 'Grappling Clinic', 'Ground & Pound', 'Tactical', 'Brawl', 'Chess Match',
  // Outcome
  'Knockout', 'Submission', 'Decision', 'Upset', 'Robbery', 'Mismatch', 'Dominant',
  // Drama
  'Comeback', 'Back-and-Forth', 'Momentum Shifts', 'Last Second Finish', 'One-Sided',
  // Stakes
  'Title Fight', 'Main Event', 'Debut', 'Rematch', 'Trilogy', 'Retirement Fight',
];

interface RateFightModalProps {
  isOpen: boolean;
  onClose: () => void;
  fight: any;
  existingRating?: number;
  existingReview?: { content: string; rating: number; id: string };
  existingTags?: string[];
}

export function RateFightModal({ isOpen, onClose, fight, existingRating, existingReview, existingTags }: RateFightModalProps) {
  const [rating, setRating] = useState(existingRating || 5);
  const [reviewText, setReviewText] = useState(existingReview?.content || '');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set(existingTags || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  if (!isOpen) return null;

  const ratingColor = getHypeHeatmapColor(rating);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await rateFight(fight.id, rating);

      if (reviewText.trim()) {
        if (existingReview) {
          await updateReview(fight.id, { content: reviewText, rating });
        } else {
          await reviewFight(fight.id, { content: reviewText, rating });
        }
      }

      if (selectedTags.size > 0) {
        await applyFightTags(fight.id, Array.from(selectedTags));
      }

      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightReviews', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['topFights'] });
      onClose();
    } catch (err: any) {
      setError(err.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Rate Fight</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {/* Fighter names */}
        <p className="mb-4 text-center text-sm text-text-secondary">
          {fight.fighter1?.firstName} {fight.fighter1?.lastName} vs {fight.fighter2?.firstName} {fight.fighter2?.lastName}
        </p>

        {error && (
          <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 p-2 text-sm text-danger">{error}</div>
        )}

        {/* Rating slider */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Star size={24} style={{ color: ratingColor }} fill={ratingColor} />
            <span className="text-4xl font-bold" style={{ color: ratingColor }}>{rating}</span>
            <span className="text-lg text-text-secondary">/ 10</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={rating}
            onChange={e => setRating(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-text-secondary">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            <span>6</span><span>7</span><span>8</span><span>9</span><span>10</span>
          </div>
        </div>

        {/* Tags */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-text-secondary">FIGHT TAGS (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {FIGHT_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  selectedTags.has(tag)
                    ? 'bg-primary text-text-on-accent'
                    : 'bg-card text-text-secondary hover:text-foreground'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Review */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-text-secondary">REVIEW (optional)</p>
          <textarea
            value={reviewText}
            onChange={e => setReviewText(e.target.value)}
            placeholder="What did you think of this fight?"
            rows={3}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-text-secondary focus:border-primary focus:outline-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full rounded-lg bg-primary py-3 font-semibold text-text-on-accent transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : existingRating ? 'Update Rating' : 'Submit Rating'}
        </button>
      </div>
    </div>
  );
}
