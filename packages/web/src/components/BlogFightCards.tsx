'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFight } from '@/lib/api';
import { BlogFightCard, type BlogFightCardData } from '@/components/BlogFightCard';

type Slot = { el: HTMLElement; fightId: string; rank?: number };

/**
 * Hydrates fight-card placeholders inside a blog post body. The post HTML is
 * injected via dangerouslySetInnerHTML, so React can't render into the markdown
 * directly — instead authors drop a placeholder where they want a card:
 *
 *   <div class="gf-fight-card" data-fight-id="FIGHT_UUID" data-rank="1"></div>
 *
 * (Put it on its own line with blank lines around it so `marked` passes the raw
 * <div> through.) `data-rank` is optional. This component finds every such
 * placeholder, fetches the fight from the public API, and portals a
 * <BlogFightCard> into each one. Grab a FIGHT_UUID from the fight's URL on
 * goodfights.app (/fights/<id>).
 *
 * Render it once, right after the post body (same place as <TweetEmbeds />).
 */
export function BlogFightCards() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [cards, setCards] = useState<Record<string, BlogFightCardData>>({});

  // Find placeholders once the post HTML is in the DOM.
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('.gf-fight-card[data-fight-id]'),
    );
    const found: Slot[] = nodes.map((el) => {
      const rankAttr = el.getAttribute('data-rank');
      const rank = rankAttr ? Number(rankAttr) : undefined;
      return {
        el,
        fightId: el.getAttribute('data-fight-id') || '',
        rank: rank && !Number.isNaN(rank) ? rank : undefined,
      };
    });
    setSlots(found.filter((s) => s.fightId));
  }, []);

  // Fetch each referenced fight (deduped). Failures are dropped silently so a
  // bad ID never breaks the article.
  useEffect(() => {
    if (slots.length === 0) return;
    const ids = Array.from(new Set(slots.map((s) => s.fightId)));
    let cancelled = false;
    Promise.all(
      ids.map(async (id) => {
        try {
          const { fight } = await getFight(id);
          return [id, fight as BlogFightCardData] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, BlogFightCardData> = {};
      for (const r of results) if (r) next[r[0]] = r[1];
      setCards(next);
    });
    return () => {
      cancelled = true;
    };
  }, [slots]);

  return (
    <>
      {slots.map((slot, i) => {
        const data = cards[slot.fightId];
        if (!data) return null;
        return createPortal(<BlogFightCard data={data} rank={slot.rank} />, slot.el, `${slot.fightId}-${i}`);
      })}
    </>
  );
}
