'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Star, Download, Plus, X, GripVertical, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
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
  averageRating?: number;
  totalRatings?: number;
  method?: string;
  round?: number;
  time?: string;
  event?: {
    id: string;
    name: string;
    promotion: string;
    date: string;
  };
}

interface SelectedFight {
  fight: Fight;
  fighter1ImageOverride?: string;
  fighter2ImageOverride?: string;
}

type CardFormat = 'instagram' | 'twitter';

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDateRange(start: Date, end: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function ordinal(n: number) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  const startStr = `${months[start.getMonth()]} ${ordinal(start.getDate())}`;
  const endStr = `${months[end.getMonth()]} ${ordinal(end.getDate())}`;
  return `${startStr} - ${endStr}`;
}

// Most recent completed Fri-Sun weekend
function getLastWeekendRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  // Days since most recent Sunday (Sun itself counts as "this week"; go back 7)
  const daysSinceLastSunday = day === 0 ? 7 : day;
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - daysSinceLastSunday);
  lastSunday.setHours(23, 59, 59, 999);
  const lastFriday = new Date(lastSunday);
  lastFriday.setDate(lastSunday.getDate() - 2);
  lastFriday.setHours(0, 0, 0, 0);
  return { start: lastFriday, end: lastSunday };
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

// Proxy external/backend images through our API to bypass CORS
function proxyImageUrl(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('data:')) return src;
  if (src.startsWith('/good-fights')) return src;
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

// ─── Card Preview ────────────────────────────────────────────────────

function SocialCard({
  fights,
  format,
  cardRef,
  headerLabel,
  cardTitle,
}: {
  fights: SelectedFight[];
  format: CardFormat;
  cardRef: React.RefObject<HTMLDivElement | null> | null;
  headerLabel: string;
  cardTitle: string;
}) {
  const isIg = format === 'instagram';
  const w = isIg ? 1080 : 1200;
  const h = isIg ? 1080 : 675;
  const isHero = fights.length === 1;

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
        {/* Subtle radial accent */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(245,197,24,0.08) 0%, transparent 60%)',
          }}
        />

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
                {headerLabel}
              </div>
              <div
                style={{
                  fontSize: isIg ? 40 : 30,
                  fontWeight: 800,
                  color: '#F5C518',
                  letterSpacing: '0.02em',
                  lineHeight: 1.1,
                }}
              >
                {cardTitle}
              </div>
            </div>
          </div>

          {/* Content: hero for 1, list for 2+ */}
          {isHero ? (
            <HeroFight sf={fights[0]} isIg={isIg} />
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: fights.length <= 3 ? 'center' : 'flex-start',
                gap: isIg ? 20 : 12,
              }}
            >
              {fights.map((sf, i) => (
                <FightRow key={sf.fight.id} sf={sf} rank={i + 1} isIg={isIg} />
              ))}
            </div>
          )}

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
            <div style={{ display: 'flex', alignItems: 'center', gap: isIg ? 12 : 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/good-fights-hand.png"
                alt=""
                style={{ width: isIg ? 36 : 26, height: isIg ? 36 : 26, objectFit: 'contain' }}
              />
              <div style={{ fontSize: isIg ? 24 : 18, fontWeight: 800, color: '#F5C518' }}>
                GOOD FIGHTS
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

function HeroFight({ sf, isIg }: { sf: SelectedFight; isIg: boolean }) {
  const { fight, fighter1ImageOverride, fighter2ImageOverride } = sf;
  const rating = fight.averageRating || 0;
  const ratingColor = rating > 0 ? getHypeHeatmapColor(rating) : '#808080';
  const promo = formatPromotion(fight.event?.promotion || '');
  const logoUrl = getPromoLogoUrl(fight.event?.promotion || '');

  const f1Img = proxyImageUrl(fighter1ImageOverride || fight.fighter1.profileImage);
  const f2Img = proxyImageUrl(fighter2ImageOverride || fight.fighter2.profileImage);

  const imgSize = isIg ? 280 : 200;
  const nameSize = isIg ? 56 : 42;
  const ratingSize = isIg ? 180 : 130;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isIg ? 24 : 14,
      }}
    >
      {/* Event / promo badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isIg ? 12 : 8,
          padding: isIg ? '8px 20px' : '6px 14px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 999,
        }}
      >
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={promo}
            style={{ height: isIg ? 28 : 22, width: isIg ? 64 : 50, objectFit: 'contain', opacity: 0.9 }}
          />
        )}
        <span
          style={{
            fontSize: isIg ? 20 : 16,
            color: '#d1d5db',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: isIg ? 600 : 500,
          }}
        >
          {fight.event?.name || ''}
        </span>
      </div>

      {/* Fighters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isIg ? 30 : 22, width: '100%', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isIg ? 14 : 10, flex: 1, minWidth: 0 }}>
          <FighterAvatar src={f1Img} fighter={fight.fighter1} size={imgSize} />
          <div
            style={{
              fontSize: nameSize,
              fontWeight: 800,
              color: '#ffffff',
              textAlign: 'center',
              lineHeight: 1.05,
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {fight.fighter1.lastName || fight.fighter1.firstName}
          </div>
        </div>

        <div
          style={{
            fontSize: isIg ? 60 : 46,
            fontWeight: 900,
            color: '#6b7280',
            letterSpacing: '0.05em',
            alignSelf: 'center',
            paddingBottom: isIg ? 50 : 36,
          }}
        >
          VS
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isIg ? 14 : 10, flex: 1, minWidth: 0 }}>
          <FighterAvatar src={f2Img} fighter={fight.fighter2} size={imgSize} />
          <div
            style={{
              fontSize: nameSize,
              fontWeight: 800,
              color: '#ffffff',
              textAlign: 'center',
              lineHeight: 1.05,
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {fight.fighter2.lastName || fight.fighter2.firstName}
          </div>
        </div>
      </div>

      {/* Rating block */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isIg ? 4 : 2,
          marginTop: isIg ? 12 : 6,
        }}
      >
        <div
          style={{
            fontSize: isIg ? 18 : 14,
            color: '#9ca3af',
            fontWeight: 600,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          Community Rating
        </div>
        <div
          style={{
            fontSize: ratingSize,
            fontWeight: 900,
            color: ratingColor,
            lineHeight: 1,
            letterSpacing: '-0.03em',
          }}
        >
          {rating > 0 ? rating.toFixed(1) : '—'}
          <span style={{ fontSize: ratingSize * 0.4, color: '#6b7280', fontWeight: 700 }}>/10</span>
        </div>
        {fight.totalRatings != null && fight.totalRatings > 0 && (
          <div style={{ fontSize: isIg ? 18 : 14, color: '#9ca3af', fontWeight: 500 }}>
            from {fight.totalRatings.toLocaleString()} rating{fight.totalRatings === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}

function FightRow({ sf, rank, isIg }: { sf: SelectedFight; rank: number; isIg: boolean }) {
  const { fight, fighter1ImageOverride, fighter2ImageOverride } = sf;
  const rating = fight.averageRating || 0;
  const ratingColor = rating > 0 ? getHypeHeatmapColor(rating) : '#808080';

  const f1Img = proxyImageUrl(fighter1ImageOverride || fight.fighter1.profileImage);
  const f2Img = proxyImageUrl(fighter2ImageOverride || fight.fighter2.profileImage);

  const imgSize = isIg ? 80 : 56;
  const fontSize = isIg ? 26 : 19;
  const promoFontSize = isIg ? 16 : 13;

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
      {/* Left: rank + promo + fighter 1 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isIg ? 10 : 6 }}>
        <div
          style={{
            fontSize: isIg ? 20 : 16,
            fontWeight: 700,
            color: '#6b7280',
            minWidth: isIg ? 24 : 18,
            textAlign: 'center',
          }}
        >
          {rank}
        </div>
        {(() => {
          const logoUrl = getPromoLogoUrl(fight.event?.promotion || '');
          return logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={formatPromotion(fight.event?.promotion || '')}
              style={{ height: isIg ? 24 : 18, width: isIg ? 60 : 44, objectFit: 'contain', opacity: 0.85 }}
            />
          ) : null;
        })()}
        <FighterAvatar src={f1Img} fighter={fight.fighter1} size={imgSize} />
      </div>

      {/* Center: fight info */}
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: isIg ? '0 12px' : '0 8px' }}>
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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {fight.event?.name && (
            <span
              style={{
                fontSize: promoFontSize - 1,
                color: '#6b7280',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {fight.event.name}
            </span>
          )}
        </div>
      </div>

      {/* Right: fighter 2 + rating */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isIg ? 12 : 8, width: isIg ? 130 : 96, justifyContent: 'flex-end' }}>
        <FighterAvatar src={f2Img} fighter={fight.fighter2} size={imgSize} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: isIg ? 52 : 40 }}>
          <div style={{ fontSize: isIg ? 12 : 9, color: '#6b7280', fontWeight: 600, marginBottom: 1 }}>
            RATING
          </div>
          <div style={{ fontSize: isIg ? 26 : 20, fontWeight: 800, color: ratingColor, lineHeight: 1 }}>
            {rating > 0 ? rating.toFixed(1) : '—'}
          </div>
        </div>
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

export default function FightOfTheNightPage() {
  const [pastEvents, setPastEvents] = useState<any[]>([]);
  const [eventFightsMap, setEventFightsMap] = useState<Record<string, Fight[]>>({});
  const [selectedFights, setSelectedFights] = useState<SelectedFight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<CardFormat>('instagram');
  const [headerLabel, setHeaderLabel] = useState('LAST WEEKEND');
  const [cardTitle, setCardTitle] = useState('FIGHT OF THE NIGHT');
  const [daysBack, setDaysBack] = useState(7);
  const [downloading, setDownloading] = useState(false);

  const igCardRef = useRef<HTMLDivElement>(null);
  const twCardRef = useRef<HTMLDivElement>(null);

  // Auto-switch default title when count changes
  useEffect(() => {
    if (selectedFights.length === 1 && cardTitle === 'TOP RATED FIGHTS') {
      setCardTitle('FIGHT OF THE NIGHT');
    } else if (selectedFights.length > 1 && cardTitle === 'FIGHT OF THE NIGHT') {
      setCardTitle('TOP RATED FIGHTS');
    }
  }, [selectedFights.length, cardTitle]);

  // Load past events
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { start, end } = getLastWeekendRange();
        setHeaderLabel(formatDateRange(start, end).toUpperCase());

        const res = await getEvents({ type: 'past', limit: 50, includeFights: true });
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysBack);
        cutoff.setHours(0, 0, 0, 0);

        const events = (res.events || []).filter((e: any) => {
          const d = new Date(e.date);
          return d >= cutoff;
        });
        // Sort most-recent first
        events.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setPastEvents(events);

        setExpandedEvents(new Set(events.map((e: any) => e.id)));

        const fMap: Record<string, Fight[]> = {};
        await Promise.all(
          events.map(async (evt: any) => {
            try {
              let fights: Fight[] = [];
              if (evt.fights && evt.fights.length > 0) {
                fights = evt.fights.map((f: any) => ({
                  ...f,
                  event: { id: evt.id, name: evt.name, promotion: evt.promotion, date: evt.date },
                }));
              } else {
                const fRes = await getFights({ eventId: evt.id, limit: 50 });
                fights = (fRes.fights || []).map((f: any) => ({
                  ...f,
                  event: { id: evt.id, name: evt.name, promotion: evt.promotion, date: evt.date },
                }));
              }
              // Sort by rating desc, unrated last
              fights.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
              fMap[evt.id] = fights;
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
  }, [daysBack]);

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

  const inlineImages = useCallback(async (container: HTMLElement) => {
    const imgs = container.querySelectorAll('img');
    await Promise.all(
      Array.from(imgs).map(async (img) => {
        if (!img.src || img.src.startsWith('data:')) return;
        try {
          const resp = await fetch(img.src);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          img.src = dataUrl;
        } catch {
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
      const width = fmt === 'instagram' ? 1080 : 1200;
      const height = fmt === 'instagram' ? 1080 : 675;
      await inlineImages(ref.current);
      const dataUrl = await toPng(ref.current, {
        width,
        height,
        pixelRatio: 1,
        style: { transform: 'scale(1)', transformOrigin: 'top left' },
      });
      const link = document.createElement('a');
      link.download = `good-fights-fight-of-the-night-${fmt}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e: any) {
      console.error('Download failed:', e);
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
        <h1 className="text-2xl font-bold text-primary">Fight of the Night Card Generator</h1>
        <p className="text-sm text-text-secondary mt-1">
          Pick fights from recent events and download a social card showing their community ratings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT: Fight selector */}
        <div className="space-y-4">
          {/* Header text + title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Top label</label>
              <input
                type="text"
                value={headerLabel}
                onChange={(e) => setHeaderLabel(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                placeholder="LAST WEEKEND"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Card title</label>
              <input
                type="text"
                value={cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                placeholder="FIGHT OF THE NIGHT"
              />
            </div>
          </div>

          {/* Days back */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Show events from last{' '}
              <input
                type="number"
                min={1}
                max={60}
                value={daysBack}
                onChange={(e) => setDaysBack(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="inline-block w-14 rounded border border-border bg-card px-2 py-0.5 text-sm text-foreground focus:border-primary focus:outline-none"
              />{' '}
              days
            </label>
          </div>

          {/* Selected fights */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-2">
              Selected Fights ({selectedFights.length})
            </h2>
            {selectedFights.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-text-secondary">
                Click a fight below. Pick 1 for a hero card, or 2–5 for a top-rated list.
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

          {/* Past events */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-2">Recent Events</h2>
            {loading ? (
              <div className="text-sm text-text-secondary py-4 text-center">Loading events...</div>
            ) : pastEvents.length === 0 ? (
              <div className="text-sm text-text-secondary py-4 text-center">
                No past events in this range. Try increasing the days-back.
              </div>
            ) : (
              <div className="space-y-2">
                {pastEvents.map((evt) => (
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
                        <span className="ml-2 text-xs text-text-secondary">
                          {new Date(evt.date).toLocaleDateString()}
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
                            {fight.averageRating != null && fight.averageRating > 0 ? (
                              <div className="flex items-center gap-1">
                                <Star size={12} style={{ color: getHypeHeatmapColor(fight.averageRating) }} />
                                <span
                                  className="text-xs font-bold"
                                  style={{ color: getHypeHeatmapColor(fight.averageRating) }}
                                >
                                  {fight.averageRating.toFixed(1)}
                                </span>
                                {fight.totalRatings != null && (
                                  <span className="text-[10px] text-text-secondary">
                                    ({fight.totalRatings})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-text-secondary">no ratings</span>
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

          <div className="rounded-lg border border-border bg-card p-4">
            {selectedFights.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-sm text-text-secondary">
                Select a fight to preview card
              </div>
            ) : (
              <SocialCard
                fights={selectedFights}
                format={format}
                cardRef={null}
                headerLabel={headerLabel}
                cardTitle={cardTitle}
              />
            )}
          </div>

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

          {/* Hidden full-size cards for download */}
          <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
            {selectedFights.length > 0 && (
              <>
                <SocialCard
                  fights={selectedFights}
                  format="instagram"
                  cardRef={igCardRef}
                  headerLabel={headerLabel}
                  cardTitle={cardTitle}
                />
                <SocialCard
                  fights={selectedFights}
                  format="twitter"
                  cardRef={twCardRef}
                  headerLabel={headerLabel}
                  cardTitle={cardTitle}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Selected Fight Row ──────────────────────────────────────────────

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

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {fighterName(fight.fighter1)} vs {fighterName(fight.fighter2)}
          </div>
          <div className="text-xs text-text-secondary">
            {formatPromotion(fight.event?.promotion || '')}
            {fight.averageRating ? ` • Rating: ${fight.averageRating.toFixed(1)}` : ''}
            {fight.totalRatings != null && fight.totalRatings > 0 ? ` (${fight.totalRatings})` : ''}
          </div>
        </div>

        <button
          onClick={() => setShowImageControls(!showImageControls)}
          className={`p-1 rounded transition-colors ${
            showImageControls ? 'bg-primary/20 text-primary' : 'text-text-secondary hover:text-foreground'
          }`}
          title="Override fighter images"
        >
          <ImageIcon size={16} />
        </button>

        <button
          onClick={() => onRemove(fight.id)}
          className="p-1 text-text-secondary hover:text-danger"
        >
          <X size={16} />
        </button>
      </div>

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
