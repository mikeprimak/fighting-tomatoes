// Container component that routes to the appropriate fight card based on status
import React from 'react';
import UpcomingFightCard from './fight-cards/UpcomingFightCard';
import LiveFightCard from './fight-cards/LiveFightCard';
import CompletedFightCard from './fight-cards/CompletedFightCard';
import { FightData } from './fight-cards/shared/types';

interface FightDisplayCardProps {
  fight: FightData;
  onPress: (fight: FightData) => void;
  showEvent?: boolean;
  isNextFight?: boolean;
  hasLiveFight?: boolean;
  lastCompletedFightTime?: string;
  animateRating?: boolean;
  animatePrediction?: boolean;
}

export default function FightDisplayCard({
  fight,
  onPress,
  showEvent = true,
  isNextFight = false,
  hasLiveFight = false,
  lastCompletedFightTime,
  animateRating = false,
  animatePrediction = false,
}: FightDisplayCardProps) {
  // Determine fight status
  const getStatus = () => {
    if (fight.isComplete) return 'completed';
    if (fight.hasStarted) return 'in_progress';
    return 'upcoming';
  };

  const status = getStatus();

  // Route to appropriate card component
  if (status === 'upcoming') {
    return (
      <UpcomingFightCard
        fight={fight}
        onPress={onPress}
        showEvent={showEvent}
        isNextFight={isNextFight}
        hasLiveFight={hasLiveFight}
        lastCompletedFightTime={lastCompletedFightTime}
        animatePrediction={animatePrediction}
      />
    );
  }

  if (status === 'in_progress') {
    return (
      <LiveFightCard
        fight={fight}
        onPress={onPress}
        showEvent={showEvent}
        animateRating={animateRating}
      />
    );
  }

  // status === 'completed'
  return (
    <CompletedFightCard
      fight={fight}
      onPress={onPress}
      showEvent={showEvent}
      animateRating={animateRating}
    />
  );
}

// Re-export the FightData type for convenience
export type { FightData };
