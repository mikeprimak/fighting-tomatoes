import Link from 'next/link';
import { formatEventDate } from '@/utils/dateFormatters';

/**
 * Next-fight / last-fight SSR answer blocks (Own The SERPs front-load #5).
 * Targets the "who is X fighting next" / "when did X last fight" query family
 * with direct-answer sentences in the server HTML. Spoiler-safe by
 * construction: opponent + event + date only, never the result — spoiler-free
 * mode defaults ON for logged-out visitors, and this block is static HTML for
 * everyone, so the result stays on the fight page behind the client-side gate.
 */

const fightTime = (f: any) => new Date(f?.event?.date || 0).getTime();

/** Opponent of `fighterId` in a fight row from /api/fights. */
export function opponentOf(fight: any, fighterId: string): any {
  return fight.fighter1Id === fighterId ? fight.fighter2 : fight.fighter1;
}

function fighterName(f: any): string {
  return [f?.firstName, f?.lastName].filter(Boolean).join(' ').trim();
}

/** True when the "opponent" is the TBA placeholder (or unusable). */
function isTba(f: any): boolean {
  const name = fighterName(f);
  return !name || /\btba\b|\btbd\b/i.test(name);
}

/**
 * Derive the soonest upcoming fight and the most recent completed fight from
 * a fighter's /api/fights list (any order — sorted here).
 */
export function pickNextAndLastFight(fights: any[]): { next: any | null; last: any | null } {
  const next =
    fights
      .filter((f) => f.fightStatus === 'UPCOMING' || f.fightStatus === 'LIVE')
      .sort((a, b) => fightTime(a) - fightTime(b))[0] ?? null;
  const last =
    fights
      .filter((f) => f.fightStatus === 'COMPLETED')
      .sort((a, b) => fightTime(b) - fightTime(a))[0] ?? null;
  return { next, last };
}

/** "Saturday, August 15, 2026" — the long-form date the answer sentences use. */
export function fightDateLong(fight: any): string | null {
  return fight?.event?.date
    ? formatEventDate(fight.event.date, { weekday: 'long', month: 'long', year: true })
    : null;
}

/**
 * One-sentence next-fight answer, shared by the visible block and the meta
 * description. Null when there's no booked fight.
 */
export function nextFightSentence(fighter: any, next: any): string | null {
  if (!next) return null;
  const name = fighterName(fighter);
  const event = next.event?.name;
  if (!name || !event) return null;
  const date = fightDateLong(next);
  const opponent = opponentOf(next, fighter.id);
  if (next.fightStatus === 'LIVE') {
    return isTba(opponent)
      ? `${name} is fighting right now at ${event}.`
      : `${name} is fighting ${fighterName(opponent)} right now at ${event}.`;
  }
  const when = date ? ` on ${date}` : '';
  return isTba(opponent)
    ? `${name}'s next fight is at ${event}${when}. The opponent has not been announced yet.`
    : `${name}'s next fight is against ${fighterName(opponent)} at ${event}${when}.`;
}

function AnswerCard({
  heading,
  sentence,
  links,
}: {
  heading: string;
  sentence: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary">{heading}</h2>
      <p className="text-sm leading-relaxed">{sentence}</p>
      {links.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="font-medium text-primary hover:underline">
              {l.label}
            </Link>
          ))}
        </p>
      )}
    </div>
  );
}

export function FighterFightStatus({ fighter, fights }: { fighter: any; fights: any[] }) {
  if (!fighter) return null;
  const { next, last } = pickNextAndLastFight(fights);
  if (!next && !last) return null;

  const name = fighterName(fighter);
  const nextSentence = nextFightSentence(fighter, next);
  const lastSentence = (() => {
    if (!last?.event?.name) return null;
    const opponent = opponentOf(last, fighter.id);
    const date = fightDateLong(last);
    const when = date ? ` on ${date}` : '';
    return isTba(opponent)
      ? `${name} last fought at ${last.event.name}${when}.`
      : `${name} last fought ${fighterName(opponent)} at ${last.event.name}${when}.`;
  })();
  // "No fight booked" only makes sense for a fighter with history — a page
  // with zero fights renders nothing here at all.
  const noNextSentence = !next && last ? `${name} does not have a fight booked right now.` : null;
  const cardCount = [nextSentence || noNextSentence, lastSentence].filter(Boolean).length;

  return (
    <section className={`mb-6 grid gap-3 ${cardCount > 1 ? 'sm:grid-cols-2' : ''}`}>
      {nextSentence && next && (
        <AnswerCard
          heading="Next fight"
          sentence={nextSentence}
          links={[
            ...(next.slug || next.id
              ? [{ href: `/fights/${next.slug || next.id}`, label: 'Fight preview and fan hype' }]
              : []),
            ...(next.event?.id ? [{ href: `/events/${next.event.id}`, label: 'Full card' }] : []),
          ]}
        />
      )}
      {noNextSentence && <AnswerCard heading="Next fight" sentence={noNextSentence} links={[]} />}
      {lastSentence && last && (
        <AnswerCard
          heading="Last fight"
          sentence={lastSentence}
          links={
            last.slug || last.id
              ? [{ href: `/fights/${last.slug || last.id}`, label: 'See fan ratings' }]
              : []
          }
        />
      )}
    </section>
  );
}
