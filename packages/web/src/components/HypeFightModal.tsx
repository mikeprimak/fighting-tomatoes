'use client';

import { useState } from 'react';
import { X, Flame } from 'lucide-react';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { createFightPrediction } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface HypeFightModalProps {
  isOpen: boolean;
  onClose: () => void;
  fight: any;
  existingHype?: number;
}

export function HypeFightModal({ isOpen, onClose, fight, existingHype }: HypeFightModalProps) {
  const [hype, setHype] = useState(existingHype || 5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  if (!isOpen) return null;

  const hypeColor = getHypeHeatmapColor(hype);

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await createFightPrediction(fight.id, { predictedRating: hype });
      queryClient.invalidateQueries({ queryKey: ['fight', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['fightStats', fight.id] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      onClose();
    } catch (err: any) {
      setError(err.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Rate Your Hype</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-center text-sm text-text-secondary">
          {fight.fighter1?.firstName} {fight.fighter1?.lastName} vs {fight.fighter2?.firstName} {fight.fighter2?.lastName}
        </p>

        {error && (
          <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 p-2 text-sm text-danger">{error}</div>
        )}

        {/* Hype slider */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Flame size={28} style={{ color: hypeColor }} />
            <span className="text-5xl font-bold" style={{ color: hypeColor }}>{hype}</span>
            <span className="text-lg text-text-secondary">/ 10</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={hype}
            onChange={e => setHype(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-text-secondary">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            <span>6</span><span>7</span><span>8</span><span>9</span><span>10</span>
          </div>
          <p className="mt-2 text-center text-xs text-text-secondary">
            How excited are you for this fight?
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full rounded-lg bg-primary py-3 font-semibold text-text-on-accent transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : existingHype ? 'Update Hype' : 'Submit Hype'}
        </button>
      </div>
    </div>
  );
}
