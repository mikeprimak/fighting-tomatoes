'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Flame, Download, Plus, X, GripVertical, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { getEvents, getFights } from '@/lib/api';
import { getHypeHeatmapColor } from '@/utils/heatmap';
import { toPng } from 'html-to-image';

// ─── Types ───────────────────────────────────────────────────────────

interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  profileImage?: string;
  wins: number;
  losses: number;
  draws: number;
}

interface Fight {
  id: string;
  fighter1: Fighter;
  fighter2: Fighter;
  weightClass?: string;
  isTitle: boolean;
  titleName?: string;
  averageHype?: number;
  hypeCount?: number;
  event?: {
    id: string;
    name: string;
    promotion: string;
    date: string;
    earlyPrelimStartTime?: string | null;
    prelimStartTime?: string | null;
    mainStartTime?: string | null;
  };
}

interface SelectedFight {
  fight: Fight;
  fighter1ImageOverride?: string;
  fighter2ImageOverride?: string;
}

type CardFormat = 'instagram' | 'twitter';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatWeekendDates(start: Date, end: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function ordinal(n: number) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  const fri = `${days[start.getDay()]} ${months[start.getMonth()]} ${ordinal(start.getDate())}`;
  const sun = `${days[end.getDay()]} ${months[end.getMonth()]} ${ordinal(end.getDate())}`;
  return `Most hyped fights — ${fri} – ${sun}`;
}

function getThisWeekendRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  // Start: this Friday at 00:00
  const daysUntilFri = (5 - day + 7) % 7 || (day === 5 ? 0 : 7);
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFri);
  friday.setHours(0, 0, 0, 0);
  // If we're already past Friday (Sat/Sun), go back
  if (day === 6) {
    friday.setDate(now.getDate() - 1);
  } else if (day === 0) {
    friday.setDate(now.getDate() - 2);
  }
  // End: Sunday 23:59
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);
  return { start: friday, end: sunday };
}

function formatPromotion(promo: string): string {
  if (!promo) return '';
  const upper = promo.toUpperCase();
  if (upper.includes('UFC')) return 'UFC';
  if (upper.includes('PFL')) return 'PFL';
  if (upper.includes('BKFC')) return 'BKFC';
  if (upper.includes('ONE')) return 'ONE';
  if (upper.includes('BELLATOR')) return 'BELLATOR';
  if (upper.includes('OKTAGON')) return 'OKTAGON';
  if (upper.includes('RIZIN')) return 'RIZIN';
  if (upper.includes('KARATE COMBAT')) return 'KC';
  if (upper.includes('DIRTY BOXING')) return 'DBX';
  if (upper.includes('MATCHROOM') || upper.includes('DAZN')) return 'BOXING';
  if (upper.includes('TOP RANK')) return 'BOXING';
  if (upper.includes('GOLDEN BOY')) return 'BOXING';
  return upper.length > 12 ? upper.substring(0, 12) : upper;
}

function fighterName(f: Fighter): string {
  return `${f.firstName} ${f.lastName}`;
}

function fighterInitials(f: Fighter): string {
  return `${(f.firstName?.[0] || '').toUpperCase()}${(f.lastName?.[0] || '').toUpperCase()}`;
}

function getPromoLogoUrl(promo: string): string | null {
  if (!promo) return null;
  const upper = promo.toUpperCase();
  if (upper.includes('UFC')) return '/promo-logos/ufc.png';
  if (upper.includes('PFL')) return '/promo-logos/pfl.png';
  if (upper.includes('BKFC')) return '/promo-logos/bkfc.png';
  if (upper.includes('ONE')) return '/promo-logos/one.png';
  if (upper.includes('OKTAGON')) return '/promo-logos/oktagon.png';
  if (upper.includes('RIZIN')) return '/promo-logos/rizin.png';
  if (upper.includes('KARATE COMBAT')) return '/promo-logos/karate-combat.png';
  if (upper.includes('DIRTY BOXING')) return '/promo-logos/dirtyboxing.png';
  if (upper.includes('MATCHROOM') || upper.includes('DAZN')) return '/promo-logos/matchroom.png';
  if (upper.includes('TOP RANK')) return '/promo-logos/toprank.png';
  if (upper.includes('GOLDEN BOY')) return '/promo-logos/golden-boy.png';
  if (upper.includes('ZUFFA')) return '/promo-logos/zuffa-boxing.png';
  if (upper.includes('MVP') || upper.includes('MOST VALUABLE')) return '/promo-logos/mvp.png';
  if (upper.includes('PREMIER BOXING') || upper.includes('PBC')) return '/promo-logos/pbc.png';
  return null;
}

function formatEventTime(event?: Fight['event']): string {
  if (!event) return '';
  const earliest = event.earlyPrelimStartTime || event.prelimStartTime || event.mainStartTime || event.date;
  if (!earliest) return '';
  // Convert UTC to Eastern
  const d = new Date(earliest);
  const eastern = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function ordinal(n: number) {
    const s = ['TH', 'ST', 'ND', 'RD'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  let hours = eastern.getHours();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${days[eastern.getDay()]} ${hours}${ampm} ET`;
}

// Proxy external/backend images through our API to bypass CORS
function proxyImageUrl(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('data:')) return src;
  // Local web app assets (e.g. /good-fights-hand.png) — served directly
  if (src.startsWith('/good-fights')) return src;
  // Relative backend paths (e.g. /images/athletes/...) and external URLs — proxy them
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

// ─── Card Preview Component ──────────────────────────────────────────

function SocialCard({
  fights,
  format,
  cardRef,
  weekLabel,
}: {
  fights: SelectedFight[];
  format: CardFormat;
  cardRef: React.RefObject<HTMLDivElement | null> | null;
  weekLabel: string;
}) {
  const isIg = format === 'instagram';
  const w = isIg ? 1080 : 1200;
  const h = isIg ? 1080 : 675;

  // Scale the card down for preview
  const maxPreviewWidth = 600;
  const scale = maxPreviewWidth / w;

  return (
    <div style={{ width: w * scale, height: h * scale, overflow: 'hidden' }}>
      <div
        ref={cardRef ?? undefined}
        style={{
          width: w,
          height: h,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background: 'linear-gradient(180deg, #181818 0%, #1a1a1a 50%, #181818 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle background pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(245,197,24,0.06) 0%, transparent 60%)',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: isIg ? '60px 50px 40px' : '36px 50px 28px',
          }}
        >
          {/* Header with logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isIg ? 20 : 14, marginBottom: isIg ? 32 : 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/good-fights-hand.png"
              alt="Good Fights"
              style={{ width: isIg ? 72 : 52, height: isIg ? 72 : 52, objectFit: 'contain' }}
            />
            <div>
              <div
                style={{
                  fontSize: isIg ? 16 : 12,
                  fontWeight: 600,
                  color: '#9ca3af',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                {weekLabel}
              </div>
              <div
                style={{
                  fontSize: isIg ? 38 : 32,
                  fontWeight: 800,
                  color: '#F5C518',
                  letterSpacing: '0.02em',
                  lineHeight: 1.1,
                }}
              >
                GOOD FIGHTS HYPE INDEX
              </div>
            </div>
          </div>

          {/* Fight rows */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: isIg ? 20 : 12,
            }}
          >
            {fights.map((sf, i) => (
              <FightRow key={sf.fight.id} sf={sf} rank={i + 1} isIg={isIg} />
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: isIg ? 20 : 14,
              marginTop: isIg ? 20 : 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: isIg ? 12 : 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/good-fights-hand.png"
                alt=""
                style={{ width: isIg ? 36 : 30, height: isIg ? 36 : 30, objectFit: 'contain' }}
              />
              <div>
                <div style={{ fontSize: isIg ? 24 : 20, fontWeight: 800, color: '#F5C518', lineHeight: 1.1 }}>
                  GOOD FIGHTS
                </div>
                <div style={{ fontSize: isIg ? 14 : 13, color: '#9ca3af', fontStyle: 'italic', marginTop: 2, letterSpacing: '0.01em' }}>
                  Never miss a Good Fight.
                </div>
              </div>
            </div>
            <div style={{ fontSize: isIg ? 18 : 14, color: '#9ca3af' }}>
              goodfights.app
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FightRow({ sf, rank, isIg }: { sf: SelectedFight; rank: number; isIg: boolean }) {
  const { fight, fighter1ImageOverride, fighter2ImageOverride } = sf;
  const hype = fight.averageHype || 0;
  const hypeColor = hype > 0 ? getHypeHeatmapColor(hype) : '#808080';
  const promo = formatPromotion(fight.event?.promotion || '');
  const votes = fight.hypeCount || 0;

  const f1Img = proxyImageUrl(fighter1ImageOverride || fight.fighter1.profileImage);
  const f2Img = proxyImageUrl(fighter2ImageOverride || fight.fighter2.profileImage);
  const hasAnyImage = !!(f1Img || f2Img);

  const imgSize = isIg ? 80 : 80;
  const fontSize = isIg ? 26 : 28;
  const promoFontSize = isIg ? 16 : 18;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 16,
        padding: isIg ? '14px 20px' : '10px 16px',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Left: Rank + HYPE score */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isIg ? 14 : 14, flexShrink: 0 }}>
        <div
          style={{
            fontSize: isIg ? 20 : 22,
            fontWeight: 700,
            color: '#6b7280',
            minWidth: isIg ? 24 : 26,
            textAlign: 'center',
          }}
        >
          {rank}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: isIg ? 70 : 78 }}>
          <div style={{ fontSize: isIg ? 14 : 15, color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 2 }}>
            HYPE
          </div>
          <div style={{ fontSize: isIg ? 44 : 46, fontWeight: 800, color: hypeColor, lineHeight: 1 }}>
            {hype > 0 ? hype.toFixed(1) : '—'}
          </div>
          {votes > 0 && (
            <div style={{ fontSize: isIg ? 11 : 13, color: '#6b7280', fontWeight: 600, marginTop: 4, letterSpacing: '0.02em' }}>
              {votes} fans
            </div>
          )}
        </div>
      </div>

      {/* Center: F1 avatar + Fight info + F2 avatar, clustered */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isIg ? 16 : 18, padding: isIg ? '0 16px' : '0 16px' }}>
        <FighterAvatar src={f1Img} fighter={fight.fighter1} size={imgSize} />
        <div style={{ minWidth: 0, textAlign: 'center', flexShrink: 1 }}>
          <div
            style={{
              fontSize,
              fontWeight: 700,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {fighterName(fight.fighter1)}{' '}
            <span style={{ color: '#6b7280', fontWeight: 400 }}>vs</span>{' '}
            {fighterName(fight.fighter2)}
            {fight.isTitle && (
              <span
                style={{
                  marginLeft: isIg ? 10 : 10,
                  display: 'inline-block',
                  padding: isIg ? '2px 8px' : '3px 9px',
                  background: 'rgba(245,197,24,0.15)',
                  border: '1px solid rgba(245,197,24,0.4)',
                  borderRadius: 4,
                  fontSize: isIg ? 13 : 14,
                  fontWeight: 700,
                  color: '#F5C518',
                  letterSpacing: '0.1em',
                  verticalAlign: 'middle',
                }}
              >
                TITLE
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {(fight.event?.name || formatEventTime(fight.event)) && (
              <span
                style={{
                  fontSize: promoFontSize - 1,
                  color: '#6b7280',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {[fight.event?.name, formatEventTime(fight.event)].filter(Boolean).join(' • ')}
              </span>
            )}
          </div>
        </div>
        <FighterAvatar src={f2Img} fighter={fight.fighter2} size={imgSize} />
      </div>

      {/* Right: Promo logo (far right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
        {(() => {
          const logoUrl = getPromoLogoUrl(fight.event?.promotion || '');
          return logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={formatPromotion(fight.event?.promotion || '')}
              style={{ height: isIg ? 32 : 36, width: isIg ? 72 : 80, objectFit: 'contain', opacity: 0.9 }}
            />
          ) : (
            <div style={{ width: isIg ? 72 : 80 }} />
          );
        })()}
      </div>
    </div>
  );
}

function FighterAvatar({ src, fighter, size }: { src?: string; fighter: Fighter; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: '#2a2a2a',
        border: '2px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={fighterName(fighter)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          crossOrigin="anonymous"
        />
      ) : (
        <span style={{ fontSize: size * 0.35, fontWeight: 700, color: '#6b7280' }}>
          {fighterInitials(fighter)}
        </span>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function WeeklyHypePage() {
  const [weekendEvents, setWeekendEvents] = useState<any[]>([]);
  const [eventFightsMap, setEventFightsMap] = useState<Record<string, Fight[]>>({});
  const [selectedFights, setSelectedFights] = useState<SelectedFight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<CardFormat>('instagram');
  const [weekLabel, setWeekLabel] = useState('THIS WEEKEND');
  const [downloading, setDownloading] = useState(false);

  const igCardRef = useRef<HTMLDivElement>(null);
  const twCardRef = useRef<HTMLDivElement>(null);

  // Load weekend events
  useEffect(() => {
    async function load() {
      try {
        const { start, end } = getThisWeekendRange();
        setWeekLabel(formatWeekendDates(start, end));
        // Fetch upcoming events with a wide range and filter client-side
        const res = await getEvents({ type: 'upcoming', limit: 50, includeFights: true });
        const events = (res.events || []).filter((e: any) => {
          const d = new Date(e.date);
          return d >= start && d <= end;
        });
        setWeekendEvents(events);

        // Auto-expand all events
        setExpandedEvents(new Set(events.map((e: any) => e.id)));

        // Extract fights from the events response (includeFights: true)
        // Fall back to fetching via /fights?eventId= if not included
        const fMap: Record<string, Fight[]> = {};
        await Promise.all(
          events.map(async (evt: any) => {
            try {
              if (evt.fights && evt.fights.length > 0) {
                fMap[evt.id] = evt.fights.map((f: any) => ({
                  ...f,
                  event: { id: evt.id, name: evt.name, promotion: evt.promotion, date: evt.date, earlyPrelimStartTime: evt.earlyPrelimStartTime, prelimStartTime: evt.prelimStartTime, mainStartTime: evt.mainStartTime },
                }));
              } else {
                const fRes = await getFights({ eventId: evt.id, limit: 50 });
                fMap[evt.id] = (fRes.fights || []).map((f: any) => ({
                  ...f,
                  event: { id: evt.id, name: evt.name, promotion: evt.promotion, date: evt.date, earlyPrelimStartTime: evt.earlyPrelimStartTime, prelimStartTime: evt.prelimStartTime, mainStartTime: evt.mainStartTime },
                }));
              }
            } catch {
              fMap[evt.id] = [];
            }
          }),
        );
        setEventFightsMap(fMap);
      } catch (e) {
        console.error('Failed to load events:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const addFight = useCallback((fight: Fight) => {
    setSelectedFights((prev) => {
      if (prev.some((sf) => sf.fight.id === fight.id)) return prev;
      return [...prev, { fight }];
    });
  }, []);

  const removeFight = useCallback((fightId: string) => {
    setSelectedFights((prev) => prev.filter((sf) => sf.fight.id !== fightId));
  }, []);

  const moveFight = useCallback((index: number, direction: 'up' | 'down') => {
    setSelectedFights((prev) => {
      const next = [...prev];
      const swapIdx = direction === 'up' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next;
    });
  }, []);

  const handleImageOverride = useCallback((fightId: string, which: 'fighter1' | 'fighter2', file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFights((prev) =>
        prev.map((sf) => {
          if (sf.fight.id !== fightId) return sf;
          return {
            ...sf,
            [which === 'fighter1' ? 'fighter1ImageOverride' : 'fighter2ImageOverride']: reader.result as string,
          };
        }),
      );
    };
    reader.readAsDataURL(file);
  }, []);

  const handleImageUrl = useCallback((fightId: string, which: 'fighter1' | 'fighter2', url: string) => {
    setSelectedFights((prev) =>
      prev.map((sf) => {
        if (sf.fight.id !== fightId) return sf;
        return {
          ...sf,
          [which === 'fighter1' ? 'fighter1ImageOverride' : 'fighter2ImageOverride']: url,
        };
      }),
    );
  }, []);

  // Convert all <img> in a container to inline data URLs so html-to-image works
  const inlineImages = useCallback(async (container: HTMLElement) => {
    const imgs = container.querySelectorAll('img');
    await Promise.all(
      Array.from(imgs).map(async (img) => {
        if (!img.src || img.src.startsWith('data:')) return;
        try {
          // All images get fetched and inlined as data URLs
          const resp = await fetch(img.src);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          img.src = dataUrl;
        } catch {
          // If fetch fails, remove the image to avoid broken image in toPng
          img.removeAttribute('src');
        }
      }),
    );
  }, []);

  const downloadCard = useCallback(async (fmt: CardFormat) => {
    const ref = fmt === 'instagram' ? igCardRef : twCardRef;
    if (!ref.current) return;
    setDownloading(true);
    try {
      const w = fmt === 'instagram' ? 1080 : 1200;
      const h = fmt === 'instagram' ? 1080 : 675;
      // Inline all external images as data URLs to avoid CORS issues
      await inlineImages(ref.current);
      const dataUrl = await toPng(ref.current, {
        width: w,
        height: h,
        pixelRatio: 1,
        style: { transform: 'scale(1)', transformOrigin: 'top left' },
      });
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const link = document.createElement('a');
      link.download = `good-fights-weekly-hype-${fmt}-${dateStr}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e: any) {
      console.error('Download failed:', e);
      console.error('Error message:', e?.message);
      console.error('Error stack:', e?.stack);
      console.error('Error name:', e?.name);
      console.error('Stringified:', JSON.stringify(e, Object.getOwnPropertyNames(e || {})));
      alert('Failed to generate image: ' + (e?.message || JSON.stringify(e)));
    } finally {
      setDownloading(false);
    }
  }, [inlineImages]);

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const isSelected = (fightId: string) => selectedFights.some((sf) => sf.fight.id === fightId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Weekly Hype Card Generator</h1>
        <p className="text-sm text-text-secondary mt-1">
          Select fights from this weekend, reorder them, and download a social media card.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT: Fight selector */}
        <div className="space-y-4">
          {/* Week label */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Header text</label>
            <input
              type="text"
              value={weekLabel}
              onChange={(e) => setWeekLabel(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="THIS WEEKEND"
            />
          </div>

          {/* Selected fights (reorderable) */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-2">
              Selected Fights ({selectedFights.length})
            </h2>
            {selectedFights.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-text-secondary">
                Click fights below to add them to your card
              </div>
            ) : (
              <div className="space-y-2">
                {selectedFights.map((sf, i) => (
                  <SelectedFightRow
                    key={sf.fight.id}
                    sf={sf}
                    index={i}
                    total={selectedFights.length}
                    onMove={moveFight}
                    onRemove={removeFight}
                    onImageOverride={handleImageOverride}
                    onImageUrl={handleImageUrl}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Weekend events & fights */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-2">This Weekend&apos;s Events</h2>
            {loading ? (
              <div className="text-sm text-text-secondary py-4 text-center">Loading events...</div>
            ) : weekendEvents.length === 0 ? (
              <div className="text-sm text-text-secondary py-4 text-center">
                No events found this weekend. Try expanding the date range or checking your data.
              </div>
            ) : (
              <div className="space-y-2">
                {weekendEvents.map((evt) => (
                  <div key={evt.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => toggleEvent(evt.id)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-background-secondary"
                    >
                      <div>
                        <span className="text-sm font-semibold text-foreground">{evt.name}</span>
                        <span className="ml-2 text-xs text-primary font-semibold">
                          {formatPromotion(evt.promotion)}
                        </span>
                      </div>
                      {expandedEvents.has(evt.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {expandedEvents.has(evt.id) && (
                      <div className="border-t border-border">
                        {(eventFightsMap[evt.id] || []).map((fight) => (
                          <button
                            key={fight.id}
                            onClick={() => isSelected(fight.id) ? removeFight(fight.id) : addFight(fight)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                              isSelected(fight.id)
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-background-secondary text-foreground'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">
                                {fighterName(fight.fighter1)} vs {fighterName(fight.fighter2)}
                              </span>
                              {fight.isTitle && (
                                <span className="ml-2 text-[10px] text-primary font-semibold">TITLE</span>
                              )}
                            </div>
                            {fight.averageHype != null && fight.averageHype > 0 && (
                              <div className="flex items-center gap-1">
                                <Flame size={12} style={{ color: getHypeHeatmapColor(fight.averageHype) }} />
                                <span
                                  className="text-xs font-bold"
                                  style={{ color: getHypeHeatmapColor(fight.averageHype) }}
                                >
                                  {fight.averageHype.toFixed(1)}
                                </span>
                              </div>
                            )}
                            {isSelected(fight.id) ? (
                              <X size={14} className="text-text-secondary" />
                            ) : (
                              <Plus size={14} className="text-text-secondary" />
                            )}
                          </button>
                        ))}
                        {(!eventFightsMap[evt.id] || eventFightsMap[evt.id].length === 0) && (
                          <div className="px-3 py-2 text-xs text-text-secondary">No fights loaded</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Card preview + download */}
        <div className="space-y-4">
          {/* Format toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setFormat('instagram')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                format === 'instagram'
                  ? 'bg-primary text-text-on-accent'
                  : 'bg-card text-text-secondary border border-border hover:text-foreground'
              }`}
            >
              Instagram (1080x1080)
            </button>
            <button
              onClick={() => setFormat('twitter')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                format === 'twitter'
                  ? 'bg-primary text-text-on-accent'
                  : 'bg-card text-text-secondary border border-border hover:text-foreground'
              }`}
            >
              Twitter (1200x675)
            </button>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-border bg-card p-4">
            {selectedFights.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-sm text-text-secondary">
                Select fights to preview card
              </div>
            ) : (
              <SocialCard
                fights={selectedFights}
                format={format}
                cardRef={null}
                weekLabel={weekLabel}
              />
            )}
          </div>

          {/* Download buttons */}
          {selectedFights.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => downloadCard('instagram')}
                disabled={downloading}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Download size={16} />
                Download Instagram
              </button>
              <button
                onClick={() => downloadCard('twitter')}
                disabled={downloading}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Download size={16} />
                Download Twitter
              </button>
            </div>
          )}

          {/* Hidden full-size cards for download (always render both so refs are available) */}
          <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
            {selectedFights.length > 0 && (
              <>
                <SocialCard fights={selectedFights} format="instagram" cardRef={igCardRef} weekLabel={weekLabel} />
                <SocialCard fights={selectedFights} format="twitter" cardRef={twCardRef} weekLabel={weekLabel} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Selected Fight Row (with reorder & image override) ──────────────

function SelectedFightRow({
  sf,
  index,
  total,
  onMove,
  onRemove,
  onImageOverride,
  onImageUrl,
}: {
  sf: SelectedFight;
  index: number;
  total: number;
  onMove: (i: number, d: 'up' | 'down') => void;
  onRemove: (id: string) => void;
  onImageOverride: (id: string, which: 'fighter1' | 'fighter2', file: File) => void;
  onImageUrl: (id: string, which: 'fighter1' | 'fighter2', url: string) => void;
}) {
  const { fight } = sf;
  const [showImageControls, setShowImageControls] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <div className="flex items-center gap-2">
        {/* Reorder */}
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMove(index, 'up')}
            disabled={index === 0}
            className="text-text-secondary hover:text-foreground disabled:opacity-25"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => onMove(index, 'down')}
            disabled={index === total - 1}
            className="text-text-secondary hover:text-foreground disabled:opacity-25"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <GripVertical size={14} className="text-text-secondary" />

        {/* Fight info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {fighterName(fight.fighter1)} vs {fighterName(fight.fighter2)}
          </div>
          <div className="text-xs text-text-secondary">
            {formatPromotion(fight.event?.promotion || '')}
            {fight.averageHype ? ` • Hype: ${fight.averageHype.toFixed(1)}` : ''}
          </div>
        </div>

        {/* Image override toggle */}
        <button
          onClick={() => setShowImageControls(!showImageControls)}
          className={`p-1 rounded transition-colors ${
            showImageControls ? 'bg-primary/20 text-primary' : 'text-text-secondary hover:text-foreground'
          }`}
          title="Override fighter images"
        >
          <ImageIcon size={16} />
        </button>

        {/* Remove */}
        <button
          onClick={() => onRemove(fight.id)}
          className="p-1 text-text-secondary hover:text-danger"
        >
          <X size={16} />
        </button>
      </div>

      {/* Image override controls */}
      {showImageControls && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2">
          <FighterImageControl
            label={fight.fighter1.lastName}
            currentImage={sf.fighter1ImageOverride || fight.fighter1.profileImage}
            onFile={(f) => onImageOverride(fight.id, 'fighter1', f)}
            onUrl={(u) => onImageUrl(fight.id, 'fighter1', u)}
          />
          <FighterImageControl
            label={fight.fighter2.lastName}
            currentImage={sf.fighter2ImageOverride || fight.fighter2.profileImage}
            onFile={(f) => onImageOverride(fight.id, 'fighter2', f)}
            onUrl={(u) => onImageUrl(fight.id, 'fighter2', u)}
          />
        </div>
      )}
    </div>
  );
}

function FighterImageControl({
  label,
  currentImage,
  onFile,
  onUrl,
}: {
  label: string;
  currentImage?: string;
  onFile: (f: File) => void;
  onUrl: (u: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) onFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
      e.preventDefault();
      onUrl(text);
    }
  };

  return (
    <div>
      <div className="text-xs text-text-secondary mb-1">{label}</div>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-2 rounded border border-dashed border-border p-1.5 cursor-pointer hover:border-primary/30 transition-colors"
      >
        {currentImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentImage} alt={label} className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center">
            <ImageIcon size={12} className="text-text-secondary" />
          </div>
        )}
        <span className="text-[10px] text-text-secondary">Drop, click, or paste URL</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
        onPaste={handlePaste}
      />
    </div>
  );
}
