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
  totalFights: number;   // fights in the org
  ratedFights: number;   // fights carrying >= 1 rating  <- the honest hook number
  ratingsCast: number;   // total ratings across the org
}

export interface VideoPayload {
  format: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  filters: { org: string; minVotes: number; limit: number; extra?: string };
  corpus: VideoCorpus;
  fights: VideoFight[];
}
