import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

/**
 * Combined hook that fetches both prediction stats and aggregate stats in one query
 * This reduces the number of API calls from 2 per fight to 1 per fight
 */
export function useFightStats(fightId: string) {
  return useQuery({
    queryKey: ['fightStats', fightId],
    queryFn: async () => {
      // Fetch both in parallel
      const [predictionStats, aggregateStats] = await Promise.all([
        apiService.getFightPredictionStats(fightId),
        apiService.getFightAggregateStats(fightId),
      ]);

      return {
        predictionStats,
        aggregateStats,
      };
    },
    staleTime: 60 * 1000, // Cache for 60 seconds
  });
}
