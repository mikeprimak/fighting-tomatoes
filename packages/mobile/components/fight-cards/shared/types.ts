// Shared types for fight card components

export interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  profileImage?: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  promotion: string;
}

export interface FightData {
  id: string;
  orderOnCard?: number;
  event: Event;
  fighter1: Fighter;
  fighter2: Fighter;
  weightClass?: string;
  isTitle: boolean;
  titleName?: string;
  averageRating: number;
  totalRatings: number;
  totalReviews: number;
  hasStarted: boolean;
  isComplete: boolean;
  currentRound?: number | null;
  completedRounds?: number | null;
  watchPlatform?: string;
  watchUrl?: string;
  // Fight outcome data
  winner?: string | null;
  method?: string | null;
  round?: number | null;
  time?: string | null;
  updatedAt?: string;
  // User-specific data
  userRating?: number;
  userReview?: {
    content: string;
    rating: number;
    createdAt: string;
  };
  userTags?: string[];
  userHypePrediction?: number | null;
  isFollowing?: boolean;
}

export interface BaseFightCardProps {
  fight: FightData;
  onPress: (fight: FightData) => void;
  showEvent?: boolean;
}
