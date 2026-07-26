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
}

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
  fights: VideoFight[];
}
