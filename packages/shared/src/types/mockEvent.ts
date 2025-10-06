// Mock Event Testing System Types

export interface TimeScaleConfig {
  beforeEventStartDelay?: number;   // Seconds before event starts (default: 10)
  betweenFightsDelay?: number;      // Seconds between fights (default: 120)
  roundDuration?: number;           // Seconds per round (default: 90)
  betweenRoundsDelay?: number;      // Seconds between rounds (default: 60)
  fightEndDelay?: number;           // Seconds after fight ends (default: 20)
  speedMultiplier?: number;         // Global speed control (default: 1)
}

export const DEFAULT_TIMESCALE: TimeScaleConfig = {
  beforeEventStartDelay: 10,
  betweenFightsDelay: 120,
  roundDuration: 90,
  betweenRoundsDelay: 60,
  fightEndDelay: 20,
  speedMultiplier: 1,
};

export const PRESET_TIMESCALES: Record<string, TimeScaleConfig> = {
  default: DEFAULT_TIMESCALE,
  fast: {
    beforeEventStartDelay: 5,
    betweenFightsDelay: 60,
    roundDuration: 45,
    betweenRoundsDelay: 30,
    fightEndDelay: 10,
    speedMultiplier: 1,
  },
  'ultra-fast': {
    beforeEventStartDelay: 3,
    betweenFightsDelay: 30,
    roundDuration: 20,
    betweenRoundsDelay: 10,
    fightEndDelay: 5,
    speedMultiplier: 1,
  },
};

export interface MockEventOptions {
  fightCount?: number;
  eventName?: string;
  includeTitle?: boolean;
}

export interface FightOutcome {
  winnerId: string;
  method: 'KO' | 'TKO' | 'Submission' | 'Decision' | 'DQ' | 'No Contest';
  round: number;
  time: string; // e.g., "2:34"
}

export type SimulationState =
  | 'EVENT_PENDING'
  | 'EVENT_STARTED'
  | 'FIGHT_STARTING'
  | 'FIGHT_IN_PROGRESS'
  | 'ROUND_END'
  | 'FIGHT_COMPLETE'
  | 'BETWEEN_FIGHTS'
  | 'EVENT_COMPLETE'
  | 'PAUSED'
  | 'STOPPED';

export interface SimulationStatus {
  isRunning: boolean;
  isPaused: boolean;
  currentState: SimulationState;
  eventId: string;
  eventName: string;
  currentFightIndex: number;
  currentRound: number;
  totalFights: number;
  nextTransition?: {
    state: SimulationState;
    inSeconds: number;
  };
  eventProgress: {
    completed: number;
    total: number;
  };
}

export interface ResetOptions {
  clearUserData?: boolean;
  clearPredictions?: boolean;
  clearRatings?: boolean;
  clearRoundScores?: boolean;
  clearReviews?: boolean;
}
