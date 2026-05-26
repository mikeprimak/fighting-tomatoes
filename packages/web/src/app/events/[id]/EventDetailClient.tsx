'use client';

import { useQuery } from '@tanstack/react-query';
import { getEvent, getFights } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatEventDate, formatEventTime, formatEventTimeCompact } from '@/utils/dateFormatters';
import { UpcomingFightCard } from '@/components/fight-cards/UpcomingFightCard';
import { CompletedFightCard } from '@/components/fight-cards/CompletedFightCard';
import { LiveFightCard } from '@/components/fight-cards/LiveFightCard';
import { HowToWatch, useEventBroadcasts } from '@/components/HowToWatch';
import { normalizeEventName } from '@/utils/eventName';
import type { CardSection } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const SECTION_ORDER = ['MAIN CARD', 'PRELIMS', 'EARLY PRELIMS'];

function sectionStartTime(section: string, event: any): string | null {
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

function groupFightsBySection(fights: any[]) {
  const sections: Record<string, any[]> = {};
  for (const fight of fights) {
    const section = fight.cardType || 'MAIN CARD';
    if (!sections[section]) sections[section] = [];
    sections[section].push(fight);
  }
  for (const key of Object.keys(sections)) {
    sections[key].sort((a: any, b: any) => (a.orderOnCard ?? 0) - (b.orderOnCard ?? 0));
  }
  return sections;
}

interface Props {
  eventId: string;
  initialEvent: any;
  initialFights: any[];
}

export function EventDetailClient({ eventId, initialEvent, initialFights }: Props) {
  const { isLoading: authLoading } = useAuth();

  const { data: eventData } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => getEvent(eventId),
    initialData: initialEvent ? { event: initialEvent } : undefined,
  });

  const { data: fightsData, isLoading: fightsLoading } = useQuery({
    queryKey: ['eventFights', eventId],
    queryFn: () => getFights({ eventId, limit: 50, includeUserData: true }),
    initialData: initialFights.length > 0 ? { fights: initialFights, pagination: { page: 1, limit: 50, total: initialFights.length, totalPages: 1 } } : undefined,
    initialDataUpdatedAt: 0,
    enabled: !authLoading,
    refetchInterval: eventData?.event?.eventStatus === 'LIVE' ? 10000 : 30000,
  });

  const event = eventData?.event;
  const fights = fightsData?.fights ?? [];

  const { data: broadcastsData } = useEventBroadcasts(event?.id ?? '');
  const sectionHasBroadcast = (s: CardSection) =>
    !!broadcastsData?.broadcasts.some((b) => b.cardSection === s);

  if (!event) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const isLive = event.eventStatus === 'LIVE';
  const isPast = event.eventStatus === 'COMPLETED';
  const sections = groupFightsBySection(fights);
  const sortedSectionKeys = Object.keys(sections).sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div className="mx-auto max-w-4xl">
      {/* Banner */}
      {event.bannerImage && (
        <div className="mb-4 overflow-hidden rounded-lg">
          <img src={event.bannerImage} alt={event.name} className="block h-auto w-full" />
        </div>
      )}

      {/* Event header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold sm:text-2xl">{normalizeEventName(event.name, event.promotion)}</h1>
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded bg-danger/20 px-2 py-0.5 text-xs font-semibold text-danger">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
              LIVE
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span>{event.promotion}</span>
          <span>-</span>
          <span>{formatEventDate(event.date, { weekday: 'long', month: 'long', year: true })}</span>
          {event.mainStartTime && <span>• Main @ {formatEventTime(event.mainStartTime)}</span>}
        </div>
        {(event.venue || event.location) && (
          <p className="mt-0.5 text-sm text-text-secondary">
            {[event.venue, event.location].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      {/* Whole-event How to Watch — not shown for past events */}
      {!isPast && <HowToWatch eventId={event.id} />}

      {/* Fights by section */}
      {fightsLoading && fights.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {sortedSectionKeys.map(section => {
        const sectionTime = sectionStartTime(section, event);
        const broadcastKey = sectionToBroadcastKey(section);
        // Past events never show How to Watch, so a broadcast can't absorb the
        // section header — keep the plain header in that case.
        const sectionAbsorbed = !isPast && broadcastKey ? sectionHasBroadcast(broadcastKey) : false;
        const showHeader = sortedSectionKeys.length > 1 && !sectionAbsorbed;
        return (
        <div key={section} className="mb-6">
          {broadcastKey && !isPast && (
            <HowToWatch
              eventId={event.id}
              section={broadcastKey}
              label={section}
              time={sectionTime ? formatEventTimeCompact(sectionTime) : undefined}
            />
          )}
          {showHeader && (
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wider text-text-secondary">{section}</span>
              {sectionTime && !isPast && (
                <span className="text-[10px] font-semibold tracking-wider text-text-secondary">
                  @ {formatEventTimeCompact(sectionTime)}
                </span>
              )}
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {sections[section].map((fight: any) => {
              if (isLive) {
                return (
                  <LiveFightCard
                    key={fight.id}
                    fight={fight}
                    isLiveNow={fight.fightStatus === 'LIVE'}
                    isUpNext={fight.fightStatus === 'UP_NEXT'}
                  />
                );
              }
              if (isPast || fight.fightStatus === 'COMPLETED') {
                return <CompletedFightCard key={fight.id} fight={fight} />;
              }
              return <UpcomingFightCard key={fight.id} fight={fight} />;
            })}
          </div>
        </div>
        );
      })}

      {fights.length === 0 && !fightsLoading && (
        <p className="py-8 text-center text-sm text-text-secondary">No fights announced yet.</p>
      )}
    </div>
  );
}
