/** Mirrors the payload emitted by packages/backend/scripts/videoData.ts */

export interface VideoFighter {
  id: string;
  name: string;
  lastName: string;
  nickname: string | null;
  headshot: string | null; // staticFile-relative, e.g. "headshots/<id>.png"
}

export interface VideoFight {
  rank: number;
  fightId: string;
  rating: number;
  votes: number;
  fighter1: VideoFighter;
  fighter2: VideoFighter;
  event: string;
  eventDate: string;
  eventDateLabel: string;
  method: string | null;
  round: number | null;
  finishLabel: string | null;
  weightClass: string | null;
  /** Where this bout sits in the pair's rivalry, oldest first. 1 when they only met once. */
  boutNumber: number;
  /** How many times these two have fought. > 1 means the card says "vs X 2". */
  totalBouts: number;
}

/**
 * "DIAZ vs McGREGOR 2".
 *
 * Numbered only when the pair actually fought more than once — a lone bout carrying a "1"
 * implies a rematch that never happened. Tolerates payloads pulled before videoData.ts
 * emitted the ordinal (older JSON simply renders unnumbered).
 */
export const matchupLabel = (f: VideoFight): string => {
  const base = `${f.fighter1.lastName.toUpperCase()} vs ${f.fighter2.lastName.toUpperCase()}`;
  return (f.totalBouts ?? 1) > 1 ? `${base} ${f.boutNumber}` : base;
};

/**
 * Corpus-level counts for on-screen claims in the hook/CTA.
 * Queried, never hardcoded — every number on screen is a factual claim.
 */
export interface VideoCorpus {
  totalFights: number;      // fights in the org
  ratedFights: number;      // org-wide fights carrying >= 1 rating
  ratingsCast: number;      // total ratings across the org
  scopeRatedFights: number; // rated fights inside THIS video's scope <- backs the hook
}

export interface VideoPayload {
  format: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  filters: { org: string; minVotes: number; limit: number; extra?: string };
  corpus: VideoCorpus;
  /** Rendered verbatim in the hook. Generated per format from queried counts. */
  hookHeadline: string;
  /**
   * What the #1 payoff may claim, scoped to the filters that produced it — a fighter
   * pull's #1 is not "the highest-rated fight in the app". Optional: payloads pulled
   * before this field existed fall back to a claim that is true of any list.
   */
  payoffLabel?: string;
  fights: VideoFight[];
}
