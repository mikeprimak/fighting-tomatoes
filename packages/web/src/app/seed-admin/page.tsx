'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Flame, Star, ChevronDown, ChevronUp, Trash2, Plus,
  Users, Loader2, AlertCircle, Check, Shuffle, KeyRound,
} from 'lucide-react';
import { getEvents, getEvent, getEventFights, API_BASE_URL } from '@/lib/api';
import { getHypeHeatmapColor } from '@/utils/heatmap';

// ─── Types ───────────────────────────────────────────────────────────

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  profileImage?: string;
}

interface Fight {
  id: string;
  fighter1: Fighter;
  fighter2: Fighter;
  fighter1Id: string;
  fighter2Id: string;
  weightClass?: string;
  isTitle: boolean;
  titleName?: string;
  fightStatus: string;
  orderOnCard?: number;
  cardType?: string;
  averageHype?: number;
  totalHypePredictions?: number;
  averageRating?: number;
  totalRatings?: number;
  winner?: string;
  method?: string;
}

interface EventData {
  id: string;
  name: string;
  promotion: string;
  date: string;
  status: string;
  fights?: Fight[];
}

interface SeedUser {
  id: string;
  email: string;
  displayName: string;
}

interface SeedPrediction {
  id: string;
  userId: string;
  predictedRating: number | null;
  user: { id: string; displayName: string; email: string };
}

interface SeedRating {
  id: string;
  userId: string;
  rating: number;
  user: { id: string; displayName: string; email: string };
}

type Tab = 'hype' | 'ratings';

// ─── Admin API helpers ──────────────────────────────────────────────

const ADMIN_KEY_STORAGE = 'seed_admin_key';

function getStoredKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(ADMIN_KEY_STORAGE) || '';
}

function setStoredKey(key: string) {
  localStorage.setItem(ADMIN_KEY_STORAGE, key);
}

function appendKey(endpoint: string, key: string): string {
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}key=${encodeURIComponent(key)}`;
}

async function adminFetch<T>(endpoint: string, key: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}${appendKey(endpoint, key)}`, { ...options, headers: { ...headers, ...(options.headers as Record<string, string>) } });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

async function getSeedUsers(key: string): Promise<SeedUser[]> {
  const data = await adminFetch<{ seedUsers: SeedUser[] }>('/admin/seed-users', key);
  return data.seedUsers;
}

async function getSeedData(fightId: string, key: string): Promise<{ predictions: SeedPrediction[]; ratings: SeedRating[] }> {
  return adminFetch('/admin/seed-data/' + fightId, key);
}

async function postSeedHype(fightId: string, entries: Array<{ seedUserId: string; predictedRating: number }>, key: string) {
  return adminFetch('/admin/seed-hype', key, { method: 'POST', body: JSON.stringify({ fightId, entries }) });
}

async function postSeedRating(fightId: string, entries: Array<{ seedUserId: string; rating: number }>, key: string) {
  return adminFetch('/admin/seed-rating', key, { method: 'POST', body: JSON.stringify({ fightId, entries }) });
}

async function deleteSeedHype(fightId: string, key: string) {
  return adminFetch('/admin/seed-hype/' + fightId, key, { method: 'DELETE' });
}

async function deleteSeedRating(fightId: string, key: string) {
  return adminFetch('/admin/seed-rating/' + fightId, key, { method: 'DELETE' });
}

// ─── Helpers ────────────────────────────────────────────────────────

function fighterName(f: Fighter): string {
  return `${f.firstName} ${f.lastName}`;
}

function fightLabel(fight: Fight): string {
  return `${fighterName(fight.fighter1)} vs ${fighterName(fight.fighter2)}`;
}

function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.round(Math.max(1, Math.min(10, mean + z * stddev)));
}

function generateRandomValues(count: number, mean: number, spread: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(gaussianRandom(mean, spread));
  }
  return values;
}

// ─── Components ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    UPCOMING: 'bg-blue-500/20 text-blue-400',
    LIVE: 'bg-red-500/20 text-red-400',
    COMPLETED: 'bg-green-500/20 text-green-400',
    CANCELLED: 'bg-gray-500/20 text-gray-400',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[status] || 'bg-gray-500/20 text-gray-400'}`}>
      {status}
    </span>
  );
}

function SeedDataPanel({
  fight,
  seedUsers,
  tab,
  adminKey,
  onRefreshFight,
}: {
  fight: Fight;
  seedUsers: SeedUser[];
  tab: Tab;
  adminKey: string;
  onRefreshFight: () => void;
}) {
  const [seedData, setSeedData] = useState<{ predictions: SeedPrediction[]; ratings: SeedRating[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Quick-add controls
  const [numUsers, setNumUsers] = useState(8);
  const [targetMean, setTargetMean] = useState(7);
  const [spread, setSpread] = useState(1.2);
  const [previewValues, setPreviewValues] = useState<number[]>([]);

  const loadSeedData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSeedData(fight.id, adminKey);
      setSeedData(data);
    } catch (err: any) {
      setError(err.error || 'Failed to load seed data');
    }
    setLoading(false);
  }, [fight.id, adminKey]);

  useEffect(() => {
    loadSeedData();
  }, [loadSeedData]);

  useEffect(() => {
    setPreviewValues(generateRandomValues(numUsers, targetMean, spread));
  }, [numUsers, targetMean, spread]);

  const regeneratePreview = () => {
    setPreviewValues(generateRandomValues(numUsers, targetMean, spread));
  };

  const handleSeedHype = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const available = seedUsers.filter(u => !seedData?.predictions.some(p => p.userId === u.id));
      const usersToUse = available.slice(0, numUsers);
      if (usersToUse.length < numUsers) {
        setError(`Only ${usersToUse.length} unused seed users available`);
        if (usersToUse.length === 0) { setSaving(false); return; }
      }

      const entries = usersToUse.map((u, i) => ({
        seedUserId: u.id,
        predictedRating: previewValues[i] ?? gaussianRandom(targetMean, spread),
      }));

      await postSeedHype(fight.id, entries, adminKey);
      setSuccess(`Seeded ${entries.length} hype predictions`);
      await loadSeedData();
      onRefreshFight();
    } catch (err: any) {
      setError(err.error || 'Failed to seed hype');
    }
    setSaving(false);
  };

  const handleSeedRatings = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const available = seedUsers.filter(u => !seedData?.ratings.some(r => r.userId === u.id));
      const usersToUse = available.slice(0, numUsers);
      if (usersToUse.length < numUsers) {
        setError(`Only ${usersToUse.length} unused seed users available`);
        if (usersToUse.length === 0) { setSaving(false); return; }
      }

      const entries = usersToUse.map((u, i) => ({
        seedUserId: u.id,
        rating: previewValues[i] ?? gaussianRandom(targetMean, spread),
      }));

      await postSeedRating(fight.id, entries, adminKey);
      setSuccess(`Seeded ${entries.length} ratings`);
      await loadSeedData();
      onRefreshFight();
    } catch (err: any) {
      setError(err.error || 'Failed to seed ratings');
    }
    setSaving(false);
  };

  const handleClear = async () => {
    if (!confirm(`Clear all seed ${tab === 'hype' ? 'predictions' : 'ratings'} for this fight?`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (tab === 'hype') {
        const res: any = await deleteSeedHype(fight.id, adminKey);
        setSuccess(`Removed ${res.deleted} seed predictions`);
      } else {
        const res: any = await deleteSeedRating(fight.id, adminKey);
        setSuccess(`Removed ${res.deleted} seed ratings`);
      }
      await loadSeedData();
      onRefreshFight();
    } catch (err: any) {
      setError(err.error || 'Failed to clear seed data');
    }
    setSaving(false);
  };

  const existingCount = tab === 'hype' ? (seedData?.predictions.length || 0) : (seedData?.ratings.length || 0);
  const existingItems = tab === 'hype' ? seedData?.predictions : seedData?.ratings;
  const existingAvg = existingItems && existingItems.length > 0
    ? (existingItems.reduce((sum, item) => sum + ((item as any).predictedRating ?? (item as any).rating ?? 0), 0) / existingItems.length).toFixed(1)
    : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Fight Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{fightLabel(fight)}</h3>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={fight.fightStatus} />
            {fight.weightClass && <span className="text-xs text-text-secondary">{fight.weightClass}</span>}
            {fight.isTitle && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary">TITLE</span>}
          </div>
        </div>
        <div className="text-right text-sm">
          {tab === 'hype' && fight.averageHype != null && fight.averageHype > 0 && (
            <div className="flex items-center gap-1">
              <Flame size={14} style={{ color: getHypeHeatmapColor(fight.averageHype) }} />
              <span style={{ color: getHypeHeatmapColor(fight.averageHype) }} className="font-bold">{fight.averageHype.toFixed(1)}</span>
              <span className="text-text-secondary text-xs">({fight.totalHypePredictions || 0})</span>
            </div>
          )}
          {tab === 'ratings' && fight.averageRating != null && fight.averageRating > 0 && (
            <div className="flex items-center gap-1">
              <Star size={14} className="text-primary" />
              <span className="font-bold text-primary">{fight.averageRating.toFixed(1)}</span>
              <span className="text-text-secondary text-xs">({fight.totalRatings || 0})</span>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="animate-spin text-text-secondary" size={20} /></div>
      ) : (
        <>
          {/* Existing Seed Data */}
          {existingCount > 0 && (
            <div className="rounded-md border border-border/50 bg-background p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Existing Seed {tab === 'hype' ? 'Predictions' : 'Ratings'}: {existingCount}
                  {existingAvg && <span className="ml-2 text-foreground">avg {existingAvg}</span>}
                </span>
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs text-danger hover:text-red-300 transition-colors"
                >
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {existingItems?.map((item: any) => {
                  const val = item.predictedRating ?? item.rating;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs border border-border/50"
                      title={item.user.displayName}
                    >
                      <span className="text-text-secondary">{item.user.displayName?.slice(0, 10)}</span>
                      <span className="font-bold" style={{ color: tab === 'hype' ? getHypeHeatmapColor(val) : 'var(--color-primary)' }}>
                        {val}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Add Controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-text-secondary" />
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Quick Add Seed {tab === 'hype' ? 'Hype' : 'Ratings'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1"># Users</label>
                <input
                  type="number" min={1} max={25} value={numUsers}
                  onChange={e => setNumUsers(Math.min(25, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Target Avg</label>
                <input
                  type="number" min={1} max={10} step={0.5} value={targetMean}
                  onChange={e => setTargetMean(Math.min(10, Math.max(1, parseFloat(e.target.value) || 5)))}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Spread</label>
                <input
                  type="number" min={0} max={3} step={0.1} value={spread}
                  onChange={e => setSpread(Math.min(3, Math.max(0, parseFloat(e.target.value) || 0)))}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-md border border-border/50 bg-background px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-secondary">Preview values</span>
                <button onClick={regeneratePreview} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                  <Shuffle size={12} /> Reroll
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {previewValues.map((v, i) => (
                  <span
                    key={i}
                    className="font-mono text-sm font-bold px-1.5 py-0.5 rounded border border-border/30"
                    style={{ color: tab === 'hype' ? getHypeHeatmapColor(v) : 'var(--color-primary)' }}
                  >
                    {v}
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-text-secondary mt-1">
                avg: {(previewValues.reduce((a, b) => a + b, 0) / previewValues.length).toFixed(1)}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={tab === 'hype' ? handleSeedHype : handleSeedRatings}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary text-text-on-accent px-4 py-2 font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Seed {tab === 'hype' ? 'Hype' : 'Ratings'}
              </button>
            </div>

            {/* Messages */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-sm text-success bg-success/10 rounded-lg px-3 py-2">
                <Check size={14} /> {success}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function SeedAdminPage() {
  const [tab, setTab] = useState<Tab>('hype');
  const [events, setEvents] = useState<EventData[]>([]);
  const [eventFightsMap, setEventFightsMap] = useState<Record<string, Fight[]>>({});
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null);
  const [seedUsers, setSeedUsers] = useState<SeedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState<Set<string>>(new Set());
  const [adminKey, setAdminKey] = useState('');
  const [keyVerified, setKeyVerified] = useState(false);

  // Load stored key on mount
  useEffect(() => {
    const stored = getStoredKey();
    if (stored) setAdminKey(stored);
  }, []);

  const eventType = tab === 'hype' ? 'upcoming' : 'past';

  const loadEvents = useCallback(async () => {
    if (!adminKey) { setLoading(false); return; }
    setLoading(true);
    setAuthError(false);
    try {
      // Load events (public endpoint)
      const eventsRes = await getEvents({ type: eventType, limit: 30, includeFights: true });
      setEvents(eventsRes.events);

      // Pre-populate fights from included data
      const fMap: Record<string, Fight[]> = {};
      for (const ev of eventsRes.events) {
        if (ev.fights && ev.fights.length > 0) {
          fMap[ev.id] = ev.fights;
        }
      }
      setEventFightsMap(fMap);

      // Load seed users (key-protected admin endpoint)
      try {
        const seedUsersRes = await getSeedUsers(adminKey);
        setSeedUsers(seedUsersRes);
        setKeyVerified(true);
        setStoredKey(adminKey);
      } catch (adminErr: any) {
        if (adminErr?.status === 401) {
          setAuthError(true);
          setKeyVerified(false);
        } else {
          console.error('Failed to load seed users:', adminErr);
        }
      }
    } catch (err: any) {
      console.error('Failed to load events:', err);
    }
    setLoading(false);
  }, [eventType, adminKey]);

  useEffect(() => {
    loadEvents();
    setSelectedFight(null);
    setExpandedEvents(new Set());
  }, [loadEvents]);

  const toggleEvent = async (eventId: string) => {
    const next = new Set(expandedEvents);
    if (next.has(eventId)) {
      next.delete(eventId);
    } else {
      next.add(eventId);
      // Load fights if not yet loaded
      if (!eventFightsMap[eventId]) {
        setLoadingEvents(prev => new Set(prev).add(eventId));
        try {
          const res = await getEventFights(eventId);
          setEventFightsMap(prev => ({ ...prev, [eventId]: res.fights }));
        } catch (err) {
          console.error('Failed to load fights for event:', err);
        }
        setLoadingEvents(prev => { const n = new Set(prev); n.delete(eventId); return n; });
      }
    }
    setExpandedEvents(next);
  };

  const handleRefreshFight = () => {
    // Reload events to get updated aggregate stats
    loadEvents();
  };

  if (!keyVerified) {
    return (
      <div className="max-w-sm mx-auto mt-20 text-center">
        <KeyRound size={48} className="mx-auto mb-4 text-primary" />
        <h1 className="text-xl font-bold text-foreground mb-2">Seed Admin</h1>
        <p className="text-text-secondary mb-4">Enter the admin key to continue.</p>
        {authError && (
          <div className="flex items-center justify-center gap-2 text-sm text-danger bg-danger/10 rounded-lg px-3 py-2 mb-4">
            <AlertCircle size={14} /> Invalid key
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); loadEvents(); }} className="space-y-3">
          <input
            type="password"
            value={adminKey}
            onChange={e => { setAdminKey(e.target.value); setAuthError(false); }}
            placeholder="Admin key"
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-foreground text-center"
            autoFocus
          />
          <button
            type="submit"
            disabled={!adminKey || loading}
            className="w-full rounded-lg bg-primary text-text-on-accent px-4 py-2.5 font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Seed Data Admin</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manually seed hype predictions and fight ratings using {seedUsers.length} seed users
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-card rounded-lg p-1 border border-border w-fit">
        <button
          onClick={() => setTab('hype')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'hype' ? 'bg-primary text-text-on-accent' : 'text-text-secondary hover:text-foreground'
          }`}
        >
          <Flame size={16} /> Seed Hype
        </button>
        <button
          onClick={() => setTab('ratings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'ratings' ? 'bg-primary text-text-on-accent' : 'text-text-secondary hover:text-foreground'
          }`}
        >
          <Star size={16} /> Seed Ratings
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-text-secondary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Event/Fight Browser */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
              {tab === 'hype' ? 'Upcoming' : 'Past'} Events ({events.length})
            </h2>

            {events.length === 0 && (
              <p className="text-text-secondary text-sm py-4">No {eventType} events found.</p>
            )}

            {events.map(event => (
              <div key={event.id} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Event Header */}
                <button
                  onClick={() => toggleEvent(event.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-background/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-primary bg-primary/20 px-1.5 py-0.5 rounded shrink-0">
                      {event.promotion}
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">{event.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-text-secondary">
                      {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {expandedEvents.has(event.id)
                      ? <ChevronUp size={16} className="text-text-secondary" />
                      : <ChevronDown size={16} className="text-text-secondary" />
                    }
                  </div>
                </button>

                {/* Fights List */}
                {expandedEvents.has(event.id) && (
                  <div className="border-t border-border">
                    {loadingEvents.has(event.id) ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 size={16} className="animate-spin text-text-secondary" />
                      </div>
                    ) : (
                      (eventFightsMap[event.id] || [])
                        .sort((a, b) => (a.orderOnCard || 99) - (b.orderOnCard || 99))
                        .map(fight => {
                          const isSelected = selectedFight?.id === fight.id;
                          const statusOk = tab === 'hype' ? fight.fightStatus === 'UPCOMING' : fight.fightStatus === 'COMPLETED';
                          return (
                            <button
                              key={fight.id}
                              onClick={() => statusOk && setSelectedFight(fight)}
                              disabled={!statusOk}
                              className={`w-full flex items-center justify-between px-3 py-2 border-t border-border/30 text-left transition-colors ${
                                isSelected
                                  ? 'bg-primary/10 border-l-2 border-l-primary'
                                  : statusOk
                                    ? 'hover:bg-background/50 cursor-pointer'
                                    : 'opacity-40 cursor-not-allowed'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-sm text-foreground truncate">
                                  {fighterName(fight.fighter1)} <span className="text-text-secondary">vs</span>{' '}
                                  {fighterName(fight.fighter2)}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {fight.cardType && (
                                    <span className="text-[10px] text-text-secondary">{fight.cardType}</span>
                                  )}
                                  {fight.weightClass && (
                                    <span className="text-[10px] text-text-secondary">{fight.weightClass}</span>
                                  )}
                                  {fight.isTitle && (
                                    <span className="text-[10px] font-bold text-primary">TITLE</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <StatusBadge status={fight.fightStatus} />
                                {tab === 'hype' && fight.averageHype != null && fight.averageHype > 0 && (
                                  <span className="text-xs font-bold" style={{ color: getHypeHeatmapColor(fight.averageHype) }}>
                                    {fight.averageHype.toFixed(1)}
                                  </span>
                                )}
                                {tab === 'ratings' && fight.averageRating != null && fight.averageRating > 0 && (
                                  <span className="text-xs font-bold text-primary">
                                    {fight.averageRating.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })
                    )}
                    {!loadingEvents.has(event.id) && (!eventFightsMap[event.id] || eventFightsMap[event.id].length === 0) && (
                      <p className="text-xs text-text-secondary py-3 px-3">No fights found</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right: Seed Data Panel */}
          <div>
            {selectedFight ? (
              <SeedDataPanel
                key={selectedFight.id + tab}
                fight={selectedFight}
                seedUsers={seedUsers}
                tab={tab}
                adminKey={adminKey}
                onRefreshFight={handleRefreshFight}
              />
            ) : (
              <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
                {tab === 'hype' ? (
                  <Flame size={40} className="text-text-secondary/30 mb-3" />
                ) : (
                  <Star size={40} className="text-text-secondary/30 mb-3" />
                )}
                <p className="text-text-secondary text-sm">
                  Select a fight from the left panel to manage seed {tab === 'hype' ? 'hype predictions' : 'ratings'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
