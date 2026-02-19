// Shared types for fight card components

export type Sport = 'MMA' | 'BOXING' | 'BARE_KNUCKLE_BOXING' | 'MUAY_THAI' | 'KICKBOXING';

export interface Fighter {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  profileImage?: string;
  wins: number;
  losses: number;
  draws: number;
  sport?: Sport;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  promotion: string;
  hasLiveTracking?: boolean;
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
  fightStatus: string;
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
  isFollowingFighter1?: boolean;
  isFollowingFighter2?: boolean;
  averageHype?: number;
  isHypedFight?: boolean;
  // Comment/Review counts
  commentCount?: number;
  userCommentCount?: number;
  reviewCount?: number;
  userReviewCount?: number;
  // Notification data
  notificationReasons?: {
    willBeNotified: boolean;
    reasons?: string[];
  };
}

export interface BaseFightCardProps {
  fight: FightData;
  onPress: (fight: FightData) => void;
  showEvent?: boolean;
}
