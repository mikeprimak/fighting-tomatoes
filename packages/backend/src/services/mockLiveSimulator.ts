// Mock Live Event Simulator
// Simulates real-time event progression with compressed timescales

import { PrismaClient } from '@prisma/client';
import { generateOutcome, selectWinner } from './mockOutcomeGenerator';

// Type definitions
interface TimeScaleConfig {
  beforeEventStartDelay?: number;
  betweenFightsDelay?: number;
  roundDuration?: number;
  betweenRoundsDelay?: number;
  fightEndDelay?: number;
  speedMultiplier?: number;
}

type SimulationState =
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

interface SimulationStatus {
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

interface ResetOptions {
  clearUserData?: boolean;
  clearPredictions?: boolean;
  clearRatings?: boolean;
  clearRoundScores?: boolean;
  clearReviews?: boolean;
}

const prisma = new PrismaClient();

interface SimulationData {
  eventId: string;
  eventName: string;
  fights: Array<{
    id: string;
    scheduledRounds: number;
    fighter1Id: string;
    fighter2Id: string;
  }>;
  currentState: SimulationState;
  currentFightIndex: number;
  currentRound: number;
  timeScale: Required<TimeScaleConfig>;
  timer?: NodeJS.Timeout;
  isPaused: boolean;
}

let activeSimulation: SimulationData | null = null;

/**
 * Start simulating a mock event
 */
export async function startSimulation(
  eventId: string,
  timeScale: TimeScaleConfig = {},
  autoGenerateOutcomes = true
): Promise<SimulationStatus> {
  if (activeSimulation) {
    throw new Error('A simulation is already running. Stop it first.');
  }

  // Load event and fights
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      fights: {
        // Order descending - prelims (higher numbers) happen first, main event (1) happens last
        orderBy: { orderOnCard: 'desc' },
        select: {
          id: true,
          scheduledRounds: true,
          fighter1Id: true,
          fighter2Id: true,
        },
      },
    },
  });

  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  // Merge with defaults
  const DEFAULT_TIMESCALE_VALUES: Required<TimeScaleConfig> = {
    beforeEventStartDelay: 10,
    betweenFightsDelay: 120,
    roundDuration: 90,
    betweenRoundsDelay: 60,
    fightEndDelay: 20,
    speedMultiplier: 1,
  };

  const mergedTimeScale: Required<TimeScaleConfig> = {
    ...DEFAULT_TIMESCALE_VALUES,
    ...timeScale,
  };

  // Initialize simulation
  activeSimulation = {
    eventId: event.id,
    eventName: event.name,
    fights: event.fights,
    currentState: 'EVENT_PENDING',
    currentFightIndex: 0,
    currentRound: 0,
    timeScale: mergedTimeScale,
    isPaused: false,
  };

  console.log(
    `Starting simulation for event: ${event.name} with ${event.fights.length} fights`
  );

  // Start the state machine
  scheduleNextTransition();

  return getStatus();
}

/**
 * Pause the simulation
 */
export function pauseSimulation(): SimulationStatus {
  if (!activeSimulation) {
    throw new Error('No active simulation');
  }

  if (activeSimulation.timer) {
    clearTimeout(activeSimulation.timer);
    activeSimulation.timer = undefined;
  }

  activeSimulation.isPaused = true;
  activeSimulation.currentState = 'PAUSED';

  console.log('Simulation paused');
  return getStatus();
}

/**
 * Resume the simulation
 */
export function resumeSimulation(): SimulationStatus {
  if (!activeSimulation) {
    throw new Error('No active simulation');
  }

  if (!activeSimulation.isPaused) {
    throw new Error('Simulation is not paused');
  }

  activeSimulation.isPaused = false;
  console.log('Simulation resumed');

  scheduleNextTransition();
  return getStatus();
}

/**
 * Skip to next state (for debugging)
 */
export async function skipToNext(): Promise<SimulationStatus> {
  if (!activeSimulation) {
    throw new Error('No active simulation');
  }

  if (activeSimulation.timer) {
    clearTimeout(activeSimulation.timer);
    activeSimulation.timer = undefined;
  }

  await executeTransition();
  return getStatus();
}

/**
 * Stop the simulation
 */
export function stopSimulation(): void {
  if (!activeSimulation) {
    throw new Error('No active simulation');
  }

  if (activeSimulation.timer) {
    clearTimeout(activeSimulation.timer);
  }

  console.log(`Stopping simulation: ${activeSimulation.eventName}`);
  activeSimulation = null;
}

/**
 * Get current simulation status
 */
export function getStatus(): SimulationStatus {
  if (!activeSimulation) {
    return {
      isRunning: false,
      isPaused: false,
      currentState: 'STOPPED',
      eventId: '',
      eventName: '',
      currentFightIndex: 0,
      currentRound: 0,
      totalFights: 0,
      eventProgress: {
        completed: 0,
        total: 0,
      },
    };
  }

  return {
    isRunning: true,
    isPaused: activeSimulation.isPaused,
    currentState: activeSimulation.currentState,
    eventId: activeSimulation.eventId,
    eventName: activeSimulation.eventName,
    currentFightIndex: activeSimulation.currentFightIndex,
    currentRound: activeSimulation.currentRound,
    totalFights: activeSimulation.fights.length,
    eventProgress: {
      completed: activeSimulation.currentFightIndex,
      total: activeSimulation.fights.length,
    },
  };
}

/**
 * Reset event to initial state
 */
export async function resetEvent(
  eventId: string,
  options: ResetOptions = {}
): Promise<void> {
  console.log(`Resetting event: ${eventId}`);

  // Stop simulation if running
  if (activeSimulation && activeSimulation.eventId === eventId) {
    stopSimulation();
  }

  // Reset event status
  await prisma.event.update({
    where: { id: eventId },
    data: {
      hasStarted: false,
      isComplete: false,
    },
  });

  // Reset all fights
  await prisma.fight.updateMany({
    where: { eventId },
    data: {
      hasStarted: false,
      isComplete: false,
      currentRound: null,
      completedRounds: null,
      winner: null,
      method: null,
      round: null,
      time: null,
    },
  });

  // Optionally clear user data
  if (options.clearUserData || options.clearPredictions) {
    const fights = await prisma.fight.findMany({
      where: { eventId },
      select: { id: true },
    });
    const fightIds = fights.map((f) => f.id);

    await prisma.fightPrediction.deleteMany({
      where: { fightId: { in: fightIds } },
    });
    console.log('Cleared predictions');
  }

  if (options.clearUserData || options.clearRatings) {
    const fights = await prisma.fight.findMany({
      where: { eventId },
      select: { id: true },
    });
    const fightIds = fights.map((f) => f.id);

    await prisma.fightRating.deleteMany({
      where: { fightId: { in: fightIds } },
    });
    console.log('Cleared ratings');
  }

  if (options.clearUserData || options.clearRoundScores) {
    const fights = await prisma.fight.findMany({
      where: { eventId },
      select: { id: true },
    });
    const fightIds = fights.map((f) => f.id);

    await prisma.crewRoundVote.deleteMany({
      where: { fightId: { in: fightIds } },
    });
    console.log('Cleared round scores');
  }

  if (options.clearUserData || options.clearReviews) {
    const fights = await prisma.fight.findMany({
      where: { eventId },
      select: { id: true },
    });
    const fightIds = fights.map((f) => f.id);

    await prisma.fightReview.deleteMany({
      where: { fightId: { in: fightIds } },
    });
    console.log('Cleared reviews');
  }

  console.log(`Event reset complete: ${eventId}`);
}

// ============== STATE MACHINE ==============

/**
 * Schedule next state transition
 */
function scheduleNextTransition() {
  if (!activeSimulation || activeSimulation.isPaused) return;

  const delay = getDelayForCurrentState();

  activeSimulation.timer = setTimeout(async () => {
    await executeTransition();
  }, delay);

  console.log(
    `Next transition: ${activeSimulation.currentState} -> in ${delay / 1000}s`
  );
}

/**
 * Get delay for current state
 */
function getDelayForCurrentState(): number {
  if (!activeSimulation) return 0;

  const ts = activeSimulation.timeScale;
  const multiplier = ts.speedMultiplier;

  switch (activeSimulation.currentState) {
    case 'EVENT_PENDING':
      return (ts.beforeEventStartDelay / multiplier) * 1000;
    case 'EVENT_STARTED':
    case 'BETWEEN_FIGHTS':
      return (ts.betweenFightsDelay / multiplier) * 1000;
    case 'FIGHT_STARTING':
      return 3000 / multiplier; // 3 seconds to start fight
    case 'FIGHT_IN_PROGRESS':
      return (ts.roundDuration / multiplier) * 1000;
    case 'ROUND_END':
      return (ts.betweenRoundsDelay / multiplier) * 1000;
    case 'FIGHT_COMPLETE':
      return (ts.fightEndDelay / multiplier) * 1000;
    default:
      return 1000;
  }
}

/**
 * Execute state transition
 */
async function executeTransition() {
  if (!activeSimulation) return;

  const state = activeSimulation.currentState;
  console.log(`Executing transition from: ${state}`);

  switch (state) {
    case 'EVENT_PENDING':
      await startEvent();
      break;
    case 'EVENT_STARTED':
      await startNextFight();
      break;
    case 'FIGHT_STARTING':
      await startRound();
      break;
    case 'FIGHT_IN_PROGRESS':
      await endRound();
      break;
    case 'ROUND_END':
      await checkFightCompletion();
      break;
    case 'FIGHT_COMPLETE':
      await moveToNextFight();
      break;
    case 'BETWEEN_FIGHTS':
      await startNextFight();
      break;
    default:
      console.log(`Unknown state: ${state}`);
  }

  // Schedule next
  if (activeSimulation && activeSimulation.currentState !== 'EVENT_COMPLETE') {
    scheduleNextTransition();
  }
}

async function startEvent() {
  if (!activeSimulation) return;

  console.log(`EVENT STARTED: ${activeSimulation.eventName}`);

  await prisma.event.update({
    where: { id: activeSimulation.eventId },
    data: { hasStarted: true },
  });

  activeSimulation.currentState = 'EVENT_STARTED';
}

async function startNextFight() {
  if (!activeSimulation) return;

  const fightIndex = activeSimulation.currentFightIndex;

  if (fightIndex >= activeSimulation.fights.length) {
    await completeEvent();
    return;
  }

  const fight = activeSimulation.fights[fightIndex];
  console.log(`FIGHT STARTING: Fight ${fightIndex + 1}/${activeSimulation.fights.length}`);

  await prisma.fight.update({
    where: { id: fight.id },
    data: { hasStarted: true, completedRounds: 0 },
  });

  activeSimulation.currentState = 'FIGHT_STARTING';
  activeSimulation.currentRound = 0;
}

async function startRound() {
  if (!activeSimulation) return;

  activeSimulation.currentRound += 1;
  const fight = activeSimulation.fights[activeSimulation.currentFightIndex];

  console.log(`ROUND ${activeSimulation.currentRound} STARTED`);

  await prisma.fight.update({
    where: { id: fight.id },
    data: { currentRound: activeSimulation.currentRound },
  });

  activeSimulation.currentState = 'FIGHT_IN_PROGRESS';
}

async function endRound() {
  if (!activeSimulation) return;

  const fight = activeSimulation.fights[activeSimulation.currentFightIndex];

  console.log(`ROUND ${activeSimulation.currentRound} ENDED`);

  await prisma.fight.update({
    where: { id: fight.id },
    data: {
      completedRounds: activeSimulation.currentRound,
      currentRound: null,
    },
  });

  activeSimulation.currentState = 'ROUND_END';
}

async function checkFightCompletion() {
  if (!activeSimulation) return;

  const fight = activeSimulation.fights[activeSimulation.currentFightIndex];
  const currentRound = activeSimulation.currentRound;

  // Generate outcome
  const outcome = generateOutcome(fight.scheduledRounds);

  // Check if fight should end
  if (
    outcome.method !== 'Decision' &&
    outcome.round === currentRound &&
    Math.random() < 0.3 // 30% chance of early finish per round
  ) {
    // Fight ends early
    await completeFight(outcome);
  } else if (currentRound >= fight.scheduledRounds) {
    // Fight goes to decision
    await completeFight({
      ...outcome,
      method: 'Decision',
      round: fight.scheduledRounds,
      time: '5:00',
    });
  } else {
    // Continue to next round
    await startRound();
  }
}

async function completeFight(outcome: any) {
  if (!activeSimulation) return;

  const fight = activeSimulation.fights[activeSimulation.currentFightIndex];
  const winnerId = selectWinner(fight.fighter1Id, fight.fighter2Id);

  console.log(`FIGHT COMPLETE: ${outcome.method} in Round ${outcome.round}`);

  await prisma.fight.update({
    where: { id: fight.id },
    data: {
      isComplete: true,
      winner: winnerId,
      method: outcome.method,
      round: outcome.round,
      time: outcome.time,
      currentRound: null,
    },
  });

  activeSimulation.currentState = 'FIGHT_COMPLETE';
}

async function moveToNextFight() {
  if (!activeSimulation) return;

  activeSimulation.currentFightIndex += 1;
  activeSimulation.currentRound = 0;

  if (activeSimulation.currentFightIndex >= activeSimulation.fights.length) {
    await completeEvent();
  } else {
    activeSimulation.currentState = 'BETWEEN_FIGHTS';
  }
}

async function completeEvent() {
  if (!activeSimulation) return;

  console.log(`EVENT COMPLETE: ${activeSimulation.eventName}`);

  await prisma.event.update({
    where: { id: activeSimulation.eventId },
    data: { isComplete: true },
  });

  activeSimulation.currentState = 'EVENT_COMPLETE';

  // Stop simulation
  if (activeSimulation.timer) {
    clearTimeout(activeSimulation.timer);
  }
  activeSimulation = null;
}
