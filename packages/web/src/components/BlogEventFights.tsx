'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { getEvent, getFights } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FightSectionList } from '@/components/fight-cards/FightSectionList';

type Slot = { el: HTMLElement; eventId: string };

// Mirrors EventDetailClient's canonicalSection — collapse scraper cardType
// labels into the three canonical sections so the embed groups like the
// event page does.
function canonicalSection(cardType: string | null | undefined): string {
  if (!cardType) return 'MAIN CARD';
  const lower = cardType.toLowerCase().trim();
  if (lower.includes('early prelim') || lower.includes('early-prelim')) return 'EARLY PRELIMS';
  if ((lower.includes('prelim') && !lower.includes('early')) || lower === 'undercard' || lower === 'under card') {
    return 'PRELIMS';
  }
  return 'MAIN CARD';
}

const SECTION_ORDER = ['MAIN CARD', 'PRELIMS', 'EARLY PRELIMS'];

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

function EmbeddedEventFights({ eventId }: { eventId: string }) {
  const { isLoading: authLoading } = useAuth();

  const { data: eventData } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => getEvent(eventId),
  });
  const event = eventData?.event;

  const { data: fightsData } = useQuery({
    queryKey: ['eventFights', event?.id],
    queryFn: () => getFights({ eventId: event.id, limit: 50, includeUserData: true }),
    enabled: !!event?.id && !authLoading,
  });

  const fights = fightsData?.fights ?? [];
  if (!event || fights.length === 0) return null;

  const isPast = event.eventStatus === 'COMPLETED';
  const isLive = event.eventStatus === 'LIVE';
  const sections = groupFightsBySection(fights);
  const sortedSectionKeys = Object.keys(sections).sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div className="not-prose my-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-foreground">
          {isPast ? 'Rate the fights' : 'How hyped are you?'}
        </span>
        <a
          href={`/events/${event.slug || event.id}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Full event page →
        </a>
      </div>
      {sortedSectionKeys.map((section) => (
        <div key={section} className="mb-4">
          {sortedSectionKeys.length > 1 && (
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wider text-text-secondary">{section}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          <FightSectionList
            fights={sections[section]}
            mode={isPast ? 'past' : isLive ? 'live' : 'upcoming'}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Hydrates whole-card fight-list placeholders inside a blog post body, the
 * event-level sibling of BlogFightCards. Authors drop one placeholder where
 * the interactive fight list should appear:
 *
 *   <div class="gf-event-fights" data-event-id="EVENT_SLUG_OR_UUID"></div>
 *
 * (On its own line with blank lines around it so `marked` passes the raw
 * <div> through.) The component fetches the event (slug or UUID both resolve)
 * and its fights, then portals the same interactive hype/rating fight list
 * used on the event page — cards open the hype/rate modals in place.
 *
 * Render once, right after the post body (next to <BlogFightCards />).
 */
export function BlogEventFights() {
  const [slots, setSlots] = useState<Slot[]>([]);

  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('.gf-event-fights[data-event-id]'),
    );
    const found: Slot[] = nodes
      .map((el) => ({ el, eventId: el.getAttribute('data-event-id') || '' }))
      .filter((s) => s.eventId);
    if (found.length > 0) setSlots(found);
  }, []);

  if (slots.length === 0) return null;

  return (
    <>
      {slots.map((slot) =>
        createPortal(<EmbeddedEventFights eventId={slot.eventId} />, slot.el, slot.eventId),
      )}
    </>
  );
}
