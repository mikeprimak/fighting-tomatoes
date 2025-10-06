// Mock Fight Outcome Generator
// Generates realistic fight outcomes for mock testing

interface FightOutcome {
  winnerId: string;
  method: 'KO' | 'TKO' | 'Submission' | 'Decision' | 'DQ' | 'No Contest';
  round: number;
  time: string;
}

const FINISH_METHODS = ['KO', 'TKO', 'Submission'] as const;
const FINISH_PROBABILITIES = {
  KO: 0.15,
  TKO: 0.25,
  Submission: 0.20,
  Decision: 0.40, // Remainder goes to decision
};

/**
 * Generate a random fight outcome
 */
export function generateOutcome(scheduledRounds: number): FightOutcome {
  const random = Math.random();

  // Determine if fight ends early or goes to decision
  const finishThreshold = FINISH_PROBABILITIES.KO + FINISH_PROBABILITIES.TKO + FINISH_PROBABILITIES.Submission;

  if (random < finishThreshold) {
    // Early finish
    return generateEarlyFinish(scheduledRounds);
  } else {
    // Goes to decision
    return generateDecision(scheduledRounds);
  }
}

/**
 * Generate early finish (KO/TKO/Submission)
 */
function generateEarlyFinish(scheduledRounds: number): FightOutcome {
  const random = Math.random();
  let method: 'KO' | 'TKO' | 'Submission';

  // Weight the methods appropriately
  if (random < 0.25) {
    method = 'KO';
  } else if (random < 0.65) {
    method = 'TKO';
  } else {
    method = 'Submission';
  }

  // Pick a random round (weighted toward later rounds)
  const round = weightedRoundSelection(scheduledRounds);

  // Generate realistic time in round (0:00 - 4:59 for 5-minute rounds)
  const minutes = Math.floor(Math.random() * 5);
  const seconds = Math.floor(Math.random() * 60);
  const time = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Winner is randomly fighter1 or fighter2
  const winnerId = Math.random() < 0.5 ? 'fighter1' : 'fighter2';

  return {
    winnerId,
    method,
    round,
    time,
  };
}

/**
 * Generate decision outcome
 */
function generateDecision(scheduledRounds: number): FightOutcome {
  // Winner is randomly fighter1 or fighter2
  const winnerId = Math.random() < 0.5 ? 'fighter1' : 'fighter2';

  return {
    winnerId,
    method: 'Decision',
    round: scheduledRounds,
    time: '5:00', // Decision always at end
  };
}

/**
 * Weighted round selection (later rounds more likely for finishes)
 */
function weightedRoundSelection(maxRounds: number): number {
  const random = Math.random();

  if (maxRounds === 3) {
    // 3-round fight: R1=30%, R2=35%, R3=35%
    if (random < 0.30) return 1;
    if (random < 0.65) return 2;
    return 3;
  } else {
    // 5-round fight: R1=15%, R2=20%, R3=25%, R4=20%, R5=20%
    if (random < 0.15) return 1;
    if (random < 0.35) return 2;
    if (random < 0.60) return 3;
    if (random < 0.80) return 4;
    return 5;
  }
}

/**
 * Generate winner ID from actual fighter IDs
 */
export function selectWinner(fighter1Id: string, fighter2Id: string): string {
  return Math.random() < 0.5 ? fighter1Id : fighter2Id;
}
