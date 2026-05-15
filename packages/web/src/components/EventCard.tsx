'use client';

import { formatEventDate, formatTimeUntil, formatTimeAgo } from '@/utils/dateFormatters';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { LiveFightCard } from '@/components/fight-cards/LiveFightCard';
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
    startTime?: string;
  };
  mode: 'upcoming' | 'past' | 'live';
}

function groupFightsBySection(fights: any[]) {
  const sections: Record<string, any[]> = {};
  for (const fight of fights) {
    const section = fight.cardType || 'MAIN CARD';
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

export function EventCard({ event, mode }: EventCardProps) {
  const fights = event.fights || [];
  const sections = groupFightsBySection(fights);
  const sortedSectionKeys = Object.keys(sections).sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const timeBadge = mode === 'upcoming'
    ? formatTimeUntil(event.date, event.startTime)
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
                  {event.name}
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
                {event.name}
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

      {/* Fights by section */}
      {sortedSectionKeys.map(section => (
        <div key={section}>
          {sortedSectionKeys.length > 1 && (
            <div className="mb-1.5 mt-3 flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wider text-text-secondary">{section}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {sections[section].map((fight: any) => {
              if (mode === 'live') {
                return <LiveFightCard key={fight.id} fight={fight} isLiveNow={fight.fightStatus === 'LIVE'} isUpNext={fight.fightStatus === 'UP_NEXT'} />;
              }
              if (mode === 'past' || fight.fightStatus === 'COMPLETED') {
                return <CompletedFightCard key={fight.id} fight={fight} />;
              }
              return <UpcomingFightCard key={fight.id} fight={fight} />;
            })}
          </div>
        </div>
      ))}

      {fights.length === 0 && (
        <p className="py-4 text-center text-sm text-text-secondary">No fights announced yet</p>
      )}
    </div>
  );
}
