'use client';

import { formatEventDate, formatEventTimeCompact, formatTimeUntil, formatTimeAgo } from '@/utils/dateFormatters';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { LiveFightCard } from '@/components/fight-cards/LiveFightCard';
import { HowToWatch, useEventBroadcasts } from '@/components/HowToWatch';
import { normalizeEventName } from '@/utils/eventName';
import type { CardSection } from '@/lib/api';
import Link from 'next/link';

interface EventCardProps {
  event: {
    id: string;
    name: string;
    date: string;
    venue?: string;
    location?: string;
    promotion: string;
    eventStatus: string;
    bannerImage?: string;
    fights?: any[];
    earlyPrelimStartTime?: string | null;
    prelimStartTime?: string | null;
    mainStartTime?: string | null;
  };
  mode: 'upcoming' | 'past' | 'live';
}

// Collapse the many scraper cardType labels into the three canonical sections
// (matches the mobile app + event detail). "Main Event" folds into MAIN CARD so
// a single-fight headliner isn't split off into its own section (MVP/Matchroom).
function canonicalSection(cardType: string | null | undefined): string {
  if (!cardType) return 'MAIN CARD';
  const lower = cardType.toLowerCase().trim();
  if (lower.includes('early prelim') || lower.includes('early-prelim')) return 'EARLY PRELIMS';
  if ((lower.includes('prelim') && !lower.includes('early')) || lower === 'undercard' || lower === 'under card') {
    return 'PRELIMS';
  }
  return 'MAIN CARD';
}

function groupFightsBySection(fights: any[]) {
  const sections: Record<string, any[]> = {};
  for (const fight of fights) {
    const section = canonicalSection(fight.cardType);
    if (!sections[section]) sections[section] = [];
    sections[section].push(fight);
  }
  // Sort fights within each section by orderOnCard
  for (const key of Object.keys(sections)) {
    sections[key].sort((a: any, b: any) => (a.orderOnCard ?? 0) - (b.orderOnCard ?? 0));
  }
  return sections;
}

const SECTION_ORDER = ['MAIN CARD', 'PRELIMS', 'EARLY PRELIMS'];

function sectionStartTime(section: string, event: { mainStartTime?: string | null; prelimStartTime?: string | null; earlyPrelimStartTime?: string | null }): string | null {
  const key = section.toUpperCase();
  if (key === 'MAIN CARD') return event.mainStartTime ?? null;
  if (key === 'PRELIMS') return event.prelimStartTime ?? null;
  if (key === 'EARLY PRELIMS') return event.earlyPrelimStartTime ?? null;
  return null;
}

function sectionToBroadcastKey(section: string): CardSection | null {
  const key = section.toUpperCase();
  if (key === 'MAIN CARD') return 'MAIN_CARD';
  if (key === 'PRELIMS') return 'PRELIMS';
  if (key === 'EARLY PRELIMS') return 'EARLY_PRELIMS';
  return null;
}

export function EventCard({ event, mode }: EventCardProps) {
  const rawFights = event.fights || [];
  const seenIds = new Set<string>();
  const fights = rawFights.filter((f: any) => {
    if (seenIds.has(f.id)) return false;
    seenIds.add(f.id);
    return true;
  });

  // The "up next" fight is the UPCOMING fight with the highest orderOnCard
  // (last to walk out), and only counts when no fight is currently LIVE and
  // at least one fight on the card has completed.
  const hasLiveFight = fights.some((f: any) => f.fightStatus === 'LIVE');
  const hasCompletedFight = fights.some((f: any) => f.fightStatus === 'COMPLETED');
  const upNextFight = (!hasLiveFight && hasCompletedFight)
    ? [...fights]
        .filter((f: any) => f.fightStatus === 'UPCOMING')
        .sort((a: any, b: any) => (b.orderOnCard ?? 0) - (a.orderOnCard ?? 0))[0]
    : undefined;

  const sections = groupFightsBySection(fights);
  const sortedSectionKeys = Object.keys(sections).sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const { data: broadcastsData } = useEventBroadcasts(event.id);
  const sectionHasBroadcast = (s: CardSection) =>
    !!broadcastsData?.broadcasts.some((b) => b.cardSection === s);

  const displayName = normalizeEventName(event.name, event.promotion);

  const timeBadge = mode === 'upcoming'
    ? formatTimeUntil(event.date, event.mainStartTime ?? undefined)
    : mode === 'past'
      ? formatTimeAgo(event.date)
      : 'LIVE';

  const timeBadgeColor = mode === 'live' ? 'bg-danger/20 text-danger' :
    timeBadge === 'TODAY' || timeBadge === 'TOMORROW' ? 'bg-primary/20 text-primary' :
    'bg-card text-text-secondary';

  return (
    <div className="mb-6">
      {/* Event banner + header */}
      <Link href={`/events/${event.id}`} className="block">
        {event.bannerImage ? (
          <div className="relative mb-2 w-full overflow-hidden rounded-lg">
            <img
              src={event.bannerImage}
              alt={event.name}
              className="block h-auto w-full"
            />
            {/* Overlay with date badge and event name */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-extrabold leading-tight text-white drop-shadow-lg sm:text-3xl">
                  {displayName}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-200 sm:text-base">
                  <span>{formatEventDate(event.date)}</span>
                  {event.venue && <span>- {event.venue}</span>}
                </div>
              </div>
              <span className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-bold uppercase tracking-wide sm:text-base ${timeBadgeColor}`}>
                {timeBadge}
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold leading-tight text-foreground sm:text-3xl">
                {displayName}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-secondary sm:text-base">
                <span>{formatEventDate(event.date)}</span>
                {event.venue && <span>- {event.venue}</span>}
              </div>
            </div>
            <span className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-bold uppercase tracking-wide sm:text-base ${timeBadgeColor}`}>
              {timeBadge}
            </span>
          </div>
        )}
      </Link>

      {/* Whole-event How to Watch — not shown for past events */}
      {mode !== 'past' && <HowToWatch eventId={event.id} />}

      {/* Fights by section */}
      {sortedSectionKeys.map(section => {
        const sTime = sectionStartTime(section, event);
        const broadcastKey = sectionToBroadcastKey(section);
        // Past events never show How to Watch, so a broadcast can't absorb the
        // section header — keep the plain header in that case.
        const sectionAbsorbed = mode !== 'past' && broadcastKey ? sectionHasBroadcast(broadcastKey) : false;
        const showHeader = (sortedSectionKeys.length > 1 || sTime) && !sectionAbsorbed;
        return (
        <div key={section}>
          {broadcastKey && mode !== 'past' && (
            <HowToWatch
              eventId={event.id}
              section={broadcastKey}
              label={section}
              time={sTime ? formatEventTimeCompact(sTime) : undefined}
            />
          )}
          {showHeader && (
            <div className="mb-1.5 mt-3 flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wider text-text-secondary">{section}</span>
              {sTime && mode !== 'past' && (
                <span className="text-[10px] font-semibold tracking-wider text-text-secondary">
                  @ {formatEventTimeCompact(sTime)}
                </span>
              )}
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {sections[section].map((fight: any) => {
              if (mode === 'past' || fight.fightStatus === 'COMPLETED') {
                return <CompletedFightCard key={fight.id} fight={fight} />;
              }
              if (mode === 'live') {
                const isLiveNow = fight.fightStatus === 'LIVE';
                const isUpNext = upNextFight?.id === fight.id;
                if (isLiveNow || isUpNext) {
                  return <LiveFightCard key={fight.id} fight={fight} isLiveNow={isLiveNow} isUpNext={isUpNext} />;
                }
                return <UpcomingFightCard key={fight.id} fight={fight} />;
              }
              return <UpcomingFightCard key={fight.id} fight={fight} />;
            })}
          </div>
        </div>
        );
      })}

      {fights.length === 0 && (
        <p className="py-4 text-center text-sm text-text-secondary">No fights announced yet</p>
      )}
    </div>
  );
}
