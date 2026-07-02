'use client';

import { useQuery } from '@tanstack/react-query';
import { getEvent, getFights } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatEventDate, formatEventTime, formatEventTimeCompact } from '@/utils/dateFormatters';
import { FightSectionList } from '@/components/fight-cards/FightSectionList';
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

// Collapse the many scraper cardType labels into the three canonical sections
// (matches the mobile app). Crucially "Main Event" folds into MAIN CARD so a
// single-fight headliner isn't split off into its own section (MVP/Matchroom).
function canonicalSection(cardType: string | null | undefined): string {
  if (!cardType) return 'MAIN CARD';
  const lower = cardType.toLowerCase().trim();
  if (lower.includes('early prelim') || lower.includes('early-prelim')) return 'EARLY PRELIMS';
  if ((lower.includes('prelim') && !lower.includes('early')) || lower === 'undercard' || lower === 'under card') {
    return 'PRELIMS';
  }
  return 'MAIN CARD';
}

// Card-level fan rating derived from the fights (Event's own aggregate columns
// are dead — lesson_dataset_aggregates_dishonest). Mirrors the server page's
// metadata/JSON-LD computation.
function cardRating(fights: any[]): { avg: number; count: number } | null {
  let sum = 0;
  let count = 0;
  for (const f of fights) {
    if (typeof f.averageRating === 'number' && f.averageRating > 0 && typeof f.totalRatings === 'number' && f.totalRatings > 0) {
      sum += f.averageRating * f.totalRatings;
      count += f.totalRatings;
    }
  }
  return count > 0 ? { avg: sum / count, count } : null;
}

function methodLabel(method: string | null | undefined, round?: number | null) {
  if (!method) return '';
  const upper = method.toUpperCase();
  let label = method;
  if (upper === 'KO_TKO' || upper === 'KO/TKO' || upper === 'KO' || upper === 'TKO') label = 'KO/TKO';
  else if (upper === 'DECISION' || upper.startsWith('DECISION')) label = 'Decision';
  else if (upper === 'SUBMISSION') label = 'Submission';
  const showRound = round && !upper.includes('DECISION');
  return `${label}${showRound ? ` R${round}` : ''}`;
}

// One plain-text line per finished fight ("Gaethje def. Poirier — KO/TKO R2").
// Rendered inside a collapsed <details> so results stay spoiler-safe for
// browsing users while still being real, indexable HTML.
function resultLine(fight: any): string | null {
  if (!fight.winner || !fight.fighter1 || !fight.fighter2) return null;
  const n1 = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
  const n2 = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
  if (fight.winner === 'draw') return `${n1} vs ${n2} — Draw`;
  if (fight.winner === 'nc') return `${n1} vs ${n2} — No Contest`;
  const winnerFirst = fight.winner === fight.fighter1.id;
  if (!winnerFirst && fight.winner !== fight.fighter2.id) return null;
  const method = methodLabel(fight.method, fight.round);
  return `${winnerFirst ? n1 : n2} def. ${winnerFirst ? n2 : n1}${method ? ` — ${method}` : ''}`;
}

function groupFightsBySection(fights: any[]) {
  const sections: Record<string, any[]> = {};
  for (const fight of fights) {
    const section = canonicalSection(fight.cardType);
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

  // The "up next" fight is the UPCOMING fight with the highest orderOnCard
  // (last to walk out), and only counts when no fight is currently LIVE and
  // at least one fight on the card has completed. Mirrors EventCard.
  const hasLiveFight = fights.some((f: any) => f.fightStatus === 'LIVE');
  const hasCompletedFight = fights.some((f: any) => f.fightStatus === 'COMPLETED');
  const upNextFight = (!hasLiveFight && hasCompletedFight)
    ? [...fights]
        .filter((f: any) => f.fightStatus === 'UPCOMING')
        .sort((a: any, b: any) => (b.orderOnCard ?? 0) - (a.orderOnCard ?? 0))[0]
    : undefined;

  // Results-state lead content (only computed for past events).
  const cardStats = isPast ? cardRating(fights) : null;
  const bestFight = isPast
    ? [...fights]
        .filter((f: any) => typeof f.averageRating === 'number' && f.averageRating > 0 && f.totalRatings > 0 && f.fighter1 && f.fighter2)
        .sort((a: any, b: any) => b.averageRating - a.averageRating || b.totalRatings - a.totalRatings)[0]
    : undefined;
  const resultLines = isPast
    ? [...fights]
        .sort((a: any, b: any) => (a.orderOnCard ?? 0) - (b.orderOnCard ?? 0))
        .map(resultLine)
        .filter((l): l is string => !!l)
    : [];

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

      {/* Preview state: the card-wide AI "why care" line (confidence-gated,
          matching the mobile home screen). SSRs via initial render. */}
      {!isPast && event.aiEventConfidence != null && event.aiEventConfidence >= 0.5 && event.aiEventSummary && (
        <p className="mb-6 text-sm leading-relaxed text-text-secondary">{event.aiEventSummary}</p>
      )}

      {/* Results state: fan verdict (rating-only — reveals no outcomes) +
          spoiler-safe collapsed full results. Both SSR via initial render. */}
      {isPast && cardStats && (
        <p className="mb-4 text-sm leading-relaxed text-text-secondary">
          Fans rated this card{' '}
          <span className="font-bold text-foreground">{cardStats.avg.toFixed(1)}/10</span> across{' '}
          {cardStats.count} rating{cardStats.count === 1 ? '' : 's'}
          {bestFight && (
            <>
              {' '}— best fight:{' '}
              <span className="font-semibold text-foreground">
                {bestFight.fighter1.firstName} {bestFight.fighter1.lastName} vs {bestFight.fighter2.firstName} {bestFight.fighter2.lastName}
              </span>{' '}
              ({bestFight.averageRating.toFixed(1)}/10)
            </>
          )}
          .
        </p>
      )}
      {isPast && resultLines.length > 0 && (
        <details className="mb-6 rounded-lg border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
            Full results (spoilers)
          </summary>
          <ul className="space-y-1.5 px-4 pb-4 text-sm text-text-secondary">
            {resultLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}

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
          <FightSectionList
            fights={sections[section]}
            mode={isPast ? 'past' : isLive ? 'live' : 'upcoming'}
            upNextFightId={upNextFight?.id}
          />
        </div>
        );
      })}

      {fights.length === 0 && !fightsLoading && (
        <p className="py-8 text-center text-sm text-text-secondary">No fights announced yet.</p>
      )}
    </div>
  );
}
