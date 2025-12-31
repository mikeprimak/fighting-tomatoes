import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { secureStorage } from '../utils/secureStorage';

// ⚙️ DEVELOPMENT CONFIG: Set to true to test production API while developing
const USE_PRODUCTION_API = false;

// Token refresh state to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

const getApiBaseUrl = () => {
  const isDevelopment = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.NODE_ENV === 'development';

  // Allow forcing production API during development for testing
  if (USE_PRODUCTION_API || !isDevelopment) {
    return 'https://fightcrewapp-backend.onrender.com/api';
  }

  // In development, use localhost for web and network IP for mobile
  if (Platform.OS === 'web') {
    return 'http://localhost:3008/api';
  } else {
    return 'http://10.0.0.53:3008/api';  // Network IP for mobile devices (working server)
  }
};

const API_BASE_URL = getApiBaseUrl();

// Log which API we're using at startup (helps debug local vs production issues)
console.log(`[API] Using API URL: ${API_BASE_URL}`);
console.log(`[API] USE_PRODUCTION_API=${USE_PRODUCTION_API}, __DEV__=${typeof __DEV__ !== 'undefined' ? __DEV__ : 'undefined'}`);

// Export for use in auth screens
export { API_BASE_URL };

interface Fight {
  id: string;
  orderOnCard: number;
  event: {
    id: string;
    name: string;
    date: string;
    venue?: string;
    location?: string;
    promotion: string;
  };
  fighter1: {
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    profileImage?: string;
    wins: number;
    losses: number;
    draws: number;
  };
  fighter2: {
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    profileImage?: string;
    wins: number;
    losses: number;
    draws: number;
  };
  weightClass?: string;
  isTitle: boolean;
  titleName?: string;
  fighter1Odds?: string;
  fighter2Odds?: string;
  averageRating: number;
  totalRatings: number;
  totalReviews: number;
  hasStarted: boolean;
  isComplete: boolean;
  watchPlatform?: string;
  watchUrl?: string;
  // User-specific data (included when includeUserData=true)
  userRating?: number;
  userReview?: {
    content: string;
    rating: number;
    createdAt: string;
  };
  userTags?: string[];
  isFollowing?: boolean;
  isFollowingFighter1?: boolean;
  isFollowingFighter2?: boolean;
}

interface FightsResponse {
  fights: Fight[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ApiError {
  error: string;
  code: string;
  details?: any;
}

class ApiService {
  get baseURL() {
    return API_BASE_URL.replace('/api', '');
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      return await secureStorage.getItem('accessToken');
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Returns true if refresh was successful, false otherwise.
   * Uses a singleton pattern to prevent multiple simultaneous refresh attempts.
   */
  private async refreshAccessToken(): Promise<boolean> {
    // If already refreshing, wait for that refresh to complete
    if (isRefreshing && refreshPromise) {
      return refreshPromise;
    }

    isRefreshing = true;
    refreshPromise = this._doRefreshToken();

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  }

  private async _doRefreshToken(): Promise<boolean> {
    try {
      const refreshToken = await secureStorage.getItem('refreshToken');

      if (!refreshToken) {
        console.log('[API] No refresh token available');
        return false;
      }

      console.log('[API] Attempting token refresh...');

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.log('[API] Token refresh failed:', data.error || data.code);
        return false;
      }

      // Handle both response formats (tokens object or flat)
      const newAccessToken = data.tokens?.accessToken || data.accessToken;
      const newRefreshToken = data.tokens?.refreshToken || data.refreshToken;

      if (newAccessToken && newRefreshToken) {
        await secureStorage.setItem('accessToken', newAccessToken);
        await secureStorage.setItem('refreshToken', newRefreshToken);
        console.log('[API] Token refresh successful');
        return true;
      }

      console.log('[API] Token refresh response missing tokens');
      return false;
    } catch (error) {
      console.error('[API] Token refresh error:', error);
      return false;
    }
  }

  /**
   * Clear auth data and trigger logout state.
   * This is called when token refresh fails.
   */
  private async clearAuthData(): Promise<void> {
    console.log('[API] Clearing auth data due to failed token refresh');
    await secureStorage.removeItem('accessToken');
    await secureStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('userData');
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry: boolean = false
  ): Promise<T> {

    const url = `${API_BASE_URL}${endpoint}`;
    const token = await this.getAuthToken();

    const headers: HeadersInit = {
      ...options.headers,
    };

    // Only add Content-Type for requests with a body
    if (options.body) {
      (headers as any)['Content-Type'] = 'application/json';
    }

    if (token) {
      (headers as any).Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle 401 Unauthorized - try to refresh token and retry
      if (response.status === 401 && !isRetry) {
        console.log('[API] Got 401, attempting token refresh...');

        const refreshed = await this.refreshAccessToken();

        if (refreshed) {
          // Retry the original request with new token
          console.log('[API] Retrying request after token refresh');
          return this.makeRequest<T>(endpoint, options, true);
        } else {
          // Refresh failed - clear auth data (will trigger logout via AuthContext)
          await this.clearAuthData();
          throw {
            status: 401,
            error: 'Session expired. Please log in again.',
            code: 'SESSION_EXPIRED',
          } as ApiError & { status: number };
        }
      }

      const data = await response.json();

      if (!response.ok) {
        throw {
          status: response.status,
          ...data,
        } as ApiError & { status: number };
      }


      return data;
    } catch (error) {
      console.error('API request failed:', error);
      console.error('Request details:', { url, hasToken: !!token });

      if (error instanceof TypeError && error.message.includes('Network request failed')) {
        throw {
          error: 'Network error - please check your connection',
          code: 'NETWORK_ERROR',
        } as ApiError;
      }
      throw error;
    }
  }

  async getFights(params: {
    page?: number;
    limit?: number;
    includeUserData?: boolean;
    eventId?: string;
    fighterId?: string;
  } = {}): Promise<FightsResponse> {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/fights${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest<FightsResponse>(endpoint);
  }

  async getFight(fightId: string): Promise<{ fight: any }> {
    return this.makeRequest(`/fights/${fightId}`);
  }

  async rateFight(fightId: string, rating: number): Promise<{
    rating: { rating: number; createdAt: string; updatedAt: string };
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  }

  async revealFightOutcome(fightId: string): Promise<{
    message: string;
    hasRevealedOutcome: boolean;
  }> {
    return this.makeRequest(`/fights/${fightId}/reveal-outcome`, {
      method: 'POST',
    });
  }

  async reviewFight(fightId: string, data: {
    content: string;
    rating: number;
    articleUrl?: string;
    articleTitle?: string;
  }): Promise<{
    review: any;
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateReview(fightId: string, data: {
    content: string;
    rating: number;
    articleUrl?: string;
    articleTitle?: string;
  }): Promise<{
    review: any;
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/review`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async applyFightTags(fightId: string, tagNames: string[]): Promise<{
    tags: any[];
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tagNames }),
    });
  }

  async getFightTags(fightId: string): Promise<{
    tags: any[];
  }> {
    return this.makeRequest(`/fights/${fightId}/tags`);
  }

  async getFightReviews(fightId: string, params: {
    page?: number;
    limit?: number;
  } = {}): Promise<{
    reviews: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/fights/${fightId}/reviews${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest(endpoint);
  }

  async toggleReviewUpvote(fightId: string, reviewId: string): Promise<{
    message: string;
    isUpvoted: boolean;
    upvotesCount: number;
  }> {
    return this.makeRequest(`/fights/${fightId}/reviews/${reviewId}/upvote`, {
      method: 'POST',
    });
  }

  async flagReview(fightId: string, reviewId: string, reason: string): Promise<{
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/reviews/${reviewId}/flag`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async updateFightUserData(fightId: string, data: {
    rating?: number | null;
    review?: string | null;
    tags?: string[];
  }): Promise<{
    message: string;
    data: {
      rating?: number;
      review?: string;
      tags?: string[];
    };
  }> {
    return this.makeRequest(`/fights/${fightId}/user-data`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async removeAllFightData(fightId: string): Promise<{
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/rating`, {
      method: 'DELETE',
    });
  }

  async getEvents(params: {
    page?: number;
    limit?: number;
    type?: 'upcoming' | 'past' | 'all';
    includeFights?: boolean;
  } = {}): Promise<{
    events: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/events${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest(endpoint);
  }

  async getEvent(eventId: string): Promise<{ event: any }> {
    return this.makeRequest(`/events/${eventId}`);
  }

  async getEventFights(eventId: string): Promise<{ fights: Fight[] }> {
    return this.makeRequest(`/events/${eventId}/fights`);
  }

  // Fighter-related API methods
  async getFighter(fighterId: string): Promise<{ fighter: any }> {
    return this.makeRequest(`/fighters/${fighterId}`);
  }

  async getFighters(params: {
    page?: number;
    limit?: number;
  } = {}): Promise<{ fighters: any[]; pagination: { page: number; limit: number; total: number; totalPages: number; } }> {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/fighters${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest(endpoint);
  }

  async followFighter(fighterId: string): Promise<{ message: string; isFollowing: boolean }> {
    return this.makeRequest(`/fighters/${fighterId}/follow`, {
      method: 'POST',
    });
  }

  async unfollowFighter(fighterId: string): Promise<{ message: string; isFollowing: boolean }> {
    return this.makeRequest(`/fighters/${fighterId}/unfollow`, {
      method: 'DELETE',
    });
  }

  async getFollowedFighters(): Promise<{ fighters: any[] }> {
    return this.makeRequest('/fighters/followed');
  }

  // Crew-related API methods
  async getCrews(): Promise<{ crews: any[] }> {
    return this.makeRequest('/crews');
  }

  async createCrew(data: {
    name: string;
    description?: string;
    maxMembers?: number;
    allowPredictions?: boolean;
    allowRoundVoting?: boolean;
    allowReactions?: boolean;
  }): Promise<{ crew: any }> {
    return this.makeRequest('/crews', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async joinCrew(inviteCode: string): Promise<{ crew: any }> {
    return this.makeRequest('/crews/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async getCrew(crewId: string): Promise<{ crew: any }> {
    return this.makeRequest(`/crews/${crewId}`);
  }

  async getCrewMessages(crewId: string, params: {
    limit?: number;
    before?: string;
  } = {}): Promise<{ messages: any[] }> {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/crews/${crewId}/messages${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest(endpoint);
  }

  async sendCrewMessage(crewId: string, data: {
    content: string;
    fightId?: string;
  }): Promise<{ message: any }> {
    return this.makeRequest(`/crews/${crewId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteCrewMessage(crewId: string, messageId: string): Promise<void> {
    return this.makeRequest(`/crews/${crewId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async createCrewPrediction(crewId: string, fightId: string, data: {
    hypeLevel?: number; // Optional hype level
    predictedWinner?: string;
    predictedMethod?: 'DECISION' | 'KO_TKO' | 'SUBMISSION';
    predictedRound?: number;
  }): Promise<{ prediction: any }> {
    return this.makeRequest(`/crews/${crewId}/predictions/${fightId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCrewPredictions(crewId: string, fightId: string): Promise<{ predictions: any[] }> {
    return this.makeRequest(`/crews/${crewId}/predictions/${fightId}`);
  }

  async deleteCrew(crewId: string): Promise<{ message: string }> {
    return this.makeRequest(`/crews/${crewId}`, {
      method: 'DELETE',
    });
  }

  async removeCrewMember(crewId: string, memberId: string, block: boolean): Promise<{ message: string }> {
    return this.makeRequest(`/crews/${crewId}/members/${memberId}`, {
      method: 'DELETE',
      body: JSON.stringify({ block }),
    });
  }

  async updateCrewSettings(crewId: string, settings: { followOnlyUFC?: boolean }): Promise<{ crew: any }> {
    return this.makeRequest(`/crews/${crewId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async updateCrewDetails(crewId: string, details: { name?: string; description?: string; imageUrl?: string }): Promise<{ crew: any }> {
    return this.makeRequest(`/crews/${crewId}/details`, {
      method: 'PUT',
      body: JSON.stringify(details),
    });
  }

  async uploadCrewImage(imageUri: string): Promise<{ imageUrl: string; message: string }> {
    const token = await this.getAuthToken();
    const url = `${API_BASE_URL}/upload/crew-image`;

    // Create form data
    const formData = new FormData();

    // Get file extension from URI
    const uriParts = imageUri.split('.');
    const fileType = uriParts[uriParts.length - 1];

    formData.append('file', {
      uri: imageUri,
      name: `crew-image.${fileType}`,
      type: `image/${fileType}`,
    } as any);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw data;
      }

      // Return the full URL including the base URL
      return {
        ...data,
        imageUrl: `${API_BASE_URL.replace('/api', '')}${data.imageUrl}`,
      };
    } catch (error) {
      console.error('Image upload failed:', error);
      throw error;
    }
  }

  async muteCrewChat(crewId: string, duration: '8hours' | 'forever'): Promise<{ message: string; mutedUntil: string | null }> {
    return this.makeRequest(`/crews/${crewId}/mute`, {
      method: 'POST',
      body: JSON.stringify({ duration }),
    });
  }

  async unmuteCrewChat(crewId: string): Promise<{ message: string }> {
    return this.makeRequest(`/crews/${crewId}/unmute`, {
      method: 'POST',
    });
  }

  // Individual fight prediction methods
  async createFightPrediction(fightId: string, data: {
    predictedRating?: number; // hype level 1-10 (optional)
    predictedWinner?: string; // fighter1Id or fighter2Id
    predictedMethod?: 'DECISION' | 'KO_TKO' | 'SUBMISSION';
    predictedRound?: number;
  }): Promise<{ prediction: any; averageHype: number; totalHypePredictions: number; message: string }> {
    return this.makeRequest(`/fights/${fightId}/prediction`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getFightPrediction(fightId: string): Promise<{ prediction: any }> {
    return this.makeRequest(`/fights/${fightId}/prediction`);
  }

  async getFightPredictionStats(fightId: string): Promise<{
    fightId: string;
    totalPredictions: number;
    averageHype: number;
    distribution: Record<number, number>;
    winnerPredictions: {
      fighter1: { id: string; name: string; predictions: number; percentage: number };
      fighter2: { id: string; name: string; predictions: number; percentage: number };
    };
    methodPredictions: {
      DECISION: number;
      KO_TKO: number;
      SUBMISSION: number;
    };
    roundPredictions: Record<number, number>;
    fighter1MethodPredictions: {
      DECISION: number;
      KO_TKO: number;
      SUBMISSION: number;
      UNSPECIFIED?: number;
    };
    fighter1RoundPredictions: Record<number, number>;
    fighter2MethodPredictions: {
      DECISION: number;
      KO_TKO: number;
      SUBMISSION: number;
      UNSPECIFIED?: number;
    };
    fighter2RoundPredictions: Record<number, number>;
  }> {
    return this.makeRequest(`/fights/${fightId}/predictions`);
  }

  async getFightAggregateStats(fightId: string): Promise<{
    fightId: string;
    reviewCount: number;
    totalRatings: number;
    userPrediction: {
      winner: string | null;
      method: string | null;
      round: number | null;
    } | null;
    communityPrediction: {
      winner: string | null;
      method: string | null;
      round: number | null;
      fighter1Name?: string;
      fighter2Name?: string;
      fighter1Percentage?: number;
      fighter2Percentage?: number;
    } | null;
    topTags: Array<{
      name: string;
      count: number;
    }>;
    userHypeScore: number | null;
    communityAverageHype: number | null;
    hypeDistribution: Record<number, number>;
    ratingDistribution: Record<number, number>;
  }> {
    const result = await this.makeRequest<any>(`/fights/${fightId}/aggregate-stats`);

    return result;
  }

  async getEventPredictionStats(eventId: string): Promise<{
    eventId: string;
    eventName: string;
    hasStarted: boolean;
    totalPredictions: number;
    averageEventHype: number;
    mostHypedFights: Array<{
      fightId: string;
      fighter1: {
        id: string;
        name: string;
        nickname?: string;
        profileImage?: string;
      };
      fighter2: {
        id: string;
        name: string;
        nickname?: string;
        profileImage?: string;
      };
      isTitle: boolean;
      weightClass?: string;
      averageHype: number;
      totalPredictions: number;
    }>;
    topFighters: Array<{
      fightId: string;
      fighterId: string;
      name: string;
      nickname?: string;
      profileImage?: string;
      winPredictions: number;
      totalFightPredictions: number;
      methodBreakdown: {
        DECISION: number;
        KO_TKO: number;
        SUBMISSION: number;
      };
      roundBreakdown: Record<number, number>;
      opponent: {
        id: string;
        name: string;
        nickname?: string;
        profileImage?: string;
      };
    }>;
  }> {
    return this.makeRequest(`/events/${eventId}/predictions`);
  }

  async getMyRatings(params: {
    page?: string;
    limit?: string;
    sortBy?: string;
    filterType?: string;
    tagFilter?: string;
  } = {}): Promise<FightsResponse> {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/fights/my-ratings${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest<FightsResponse>(endpoint);
  }

  // Notification methods
  async registerPushToken(pushToken: string): Promise<void> {
    return this.makeRequest('/notifications/register-token', {
      method: 'POST',
      body: JSON.stringify({ pushToken }),
    });
  }

  async getNotificationPreferences(): Promise<any> {
    return this.makeRequest('/notifications/preferences');
  }

  async updateNotificationPreferences(preferences: any): Promise<void> {
    return this.makeRequest('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }

  async sendTestNotification(): Promise<void> {
    return this.makeRequest('/notifications/test', {
      method: 'POST',
    });
  }

  async sendTestPreEventReport(eventId: string): Promise<void> {
    return this.makeRequest('/notifications/test-pre-event-report', {
      method: 'POST',
      body: JSON.stringify({ eventId }),
    });
  }

  // Fight follow/notification methods
  async followFight(fightId: string): Promise<{ message: string; isFollowing: boolean }> {
    return this.makeRequest(`/fights/${fightId}/follow`, {
      method: 'POST',
    });
  }

  async unfollowFight(fightId: string): Promise<{ message: string; isFollowing: boolean }> {
    return this.makeRequest(`/fights/${fightId}/unfollow`, {
      method: 'DELETE',
    });
  }

  async toggleFightNotification(
    fightId: string,
    enabled: boolean
  ): Promise<{ message: string; willBeNotified: boolean; affectedMatches: number }> {
    return this.makeRequest(`/fights/${fightId}/notification`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  }

  async updateFighterNotificationPreferences(
    fighterId: string,
    preferences: { startOfFightNotification?: boolean; dayBeforeNotification?: boolean }
  ): Promise<{ message: string; startOfFightNotification: boolean; dayBeforeNotification: boolean }> {
    return this.makeRequest(`/fighters/${fighterId}/notification-preferences`, {
      method: 'PATCH',
      body: JSON.stringify(preferences),
    });
  }

  // Profile methods
  async updateProfile(data: {
    displayName?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  }): Promise<{ user: any; message: string }> {
    return this.makeRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadProfileImage(formData: FormData): Promise<{ imageUrl: string; message: string }> {
    const token = await this.getAuthToken();
    const url = `${API_BASE_URL}/upload/profile-image`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw data;
      }

      return data;
    } catch (error) {
      console.error('Profile image upload failed:', error);
      throw error;
    }
  }

  // News methods
  async getNews(params: {
    page?: number;
    limit?: number;
    source?: string;
  } = {}): Promise<{
    articles: Array<{
      id: string;
      headline: string;
      description: string;
      url: string;
      source: string;
      imageUrl: string | null;
      localImagePath: string | null;
      scrapedAt: string;
      createdAt: string;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const queryString = queryParams.toString();
    const endpoint = `/news${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest(endpoint);
  }

  async getNewsArticle(articleId: string): Promise<{
    article: {
      id: string;
      headline: string;
      description: string;
      url: string;
      source: string;
      imageUrl: string | null;
      localImagePath: string | null;
      scrapedAt: string;
      createdAt: string;
    };
  }> {
    return this.makeRequest(`/news/${articleId}`);
  }

  // Community methods
  async getTopComments(): Promise<{
    data: Array<{
      id: string;
      content: string;
      rating: number;
      upvotes: number;
      createdAt: string;
      userHasUpvoted: boolean;
      user: {
        id: string;
        displayName: string;
      };
      fight: {
        id: string;
        fighter1Name: string;
        fighter2Name: string;
        eventName: string;
        eventDate: string;
      };
    }>;
  }> {
    return this.makeRequest('/community/top-comments');
  }

  async getTopPreFightComments(): Promise<{
    data: Array<{
      id: string;
      content: string;
      upvotes: number;
      createdAt: string;
      userHasUpvoted: boolean;
      hypeRating: number | null;
      user: {
        id: string;
        displayName: string;
      };
      fight: {
        id: string;
        fighter1Name: string;
        fighter2Name: string;
        eventName: string;
        eventDate: string;
      };
    }>;
  }> {
    return this.makeRequest('/community/top-pre-fight-comments');
  }

  async getPreFightComments(sortBy: 'top-recent' | 'top-all-time' | 'new' = 'top-recent'): Promise<{
    data: Array<{
      id: string;
      content: string;
      upvotes: number;
      createdAt: string;
      userHasUpvoted: boolean;
      hypeRating: number | null;
      user: {
        id: string;
        displayName: string;
      };
      fight: {
        id: string;
        fighter1Name: string;
        fighter2Name: string;
        eventName: string;
        eventDate: string;
      };
    }>;
  }> {
    return this.makeRequest(`/community/pre-fight-comments?sortBy=${sortBy}`);
  }

  async getComments(sortBy: 'top-recent' | 'top-all-time' | 'new' = 'top-recent'): Promise<{
    data: Array<{
      id: string;
      content: string;
      rating: number;
      upvotes: number;
      createdAt: string;
      userHasUpvoted: boolean;
      user: {
        id: string;
        displayName: string;
      };
      fight: {
        id: string;
        fighter1Name: string;
        fighter2Name: string;
        eventName: string;
        eventDate: string;
      };
    }>;
  }> {
    return this.makeRequest(`/community/comments?sortBy=${sortBy}`);
  }

  async getTopUpcomingFights(period: string = 'week'): Promise<{ data: Fight[] }> {
    return this.makeRequest(`/community/top-upcoming-fights?period=${period}`);
  }

  async getTopRecentFights(period: string = 'week'): Promise<{ data: Fight[] }> {
    return this.makeRequest(`/community/top-recent-fights?period=${period}`);
  }

  async getHotPredictions(): Promise<{
    data: Array<Fight & { totalPredictions: number; consensusPercentage: number }>;
  }> {
    return this.makeRequest('/community/hot-predictions');
  }

  async getEvenPredictions(): Promise<{
    data: Array<Fight & { totalPredictions: number; favoritePercentage: number; slightFavorite: string; slightUnderdog: string }>;
  }> {
    return this.makeRequest('/community/even-predictions');
  }

  async getHotFighters(): Promise<{
    data: {
      recent: Array<{
        fighter: any;
        avgRating: number;
        fightCount: number;
      }>;
      upcoming: Array<{
        fighter: any;
        avgRating: number;
        fightCount: number;
      }>;
    };
  }> {
    return this.makeRequest('/community/hot-fighters');
  }

  // Pre-fight comment methods
  async createPreFightComment(fightId: string, content: string): Promise<{
    comment: {
      id: string;
      userId: string;
      fightId: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      user: {
        id: string;
        displayName: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
      };
    };
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/pre-fight-comment`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async createPreFightCommentReply(fightId: string, commentId: string, content: string): Promise<{
    comment: {
      id: string;
      userId: string;
      fightId: string;
      content: string;
      parentCommentId: string;
      createdAt: string;
      updatedAt: string;
      user: {
        id: string;
        displayName: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
      };
    };
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/pre-fight-comments/${commentId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async createFightReviewReply(fightId: string, reviewId: string, content: string): Promise<{
    review: {
      id: string;
      userId: string;
      fightId: string;
      content: string;
      rating: number | null;
      parentReviewId: string;
      createdAt: string;
      updatedAt: string;
      user: {
        id: string;
        displayName: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
      };
    };
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/reviews/${reviewId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async updatePreFightComment(fightId: string, commentId: string, content: string): Promise<{
    comment: {
      id: string;
      userId: string;
      fightId: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      user: {
        id: string;
        displayName: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
      };
    };
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/pre-fight-comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async updateFightReview(fightId: string, reviewId: string, content: string): Promise<{
    review: {
      id: string;
      userId: string;
      fightId: string;
      content: string;
      rating: number | null;
      createdAt: string;
      updatedAt: string;
      user: {
        id: string;
        displayName: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
      };
    };
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/reviews/${reviewId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async getFightPreFightComments(fightId: string): Promise<{
    comments: Array<{
      id: string;
      userId: string;
      fightId: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      user: {
        id: string;
        displayName: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
      };
    }>;
    userComment: {
      id: string;
      userId: string;
      fightId: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      user: {
        id: string;
        displayName: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
      };
    } | null;
  }> {
    return this.makeRequest(`/fights/${fightId}/pre-fight-comments`);
  }

  async flagPreFightComment(fightId: string, commentId: string, reason: string): Promise<{
    message: string;
  }> {
    return this.makeRequest(`/fights/${fightId}/pre-fight-comments/${commentId}/flag`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async togglePreFightCommentUpvote(fightId: string, commentId: string): Promise<{
    upvotes: number;
    userHasUpvoted: boolean;
  }> {
    return this.makeRequest(`/fights/${fightId}/pre-fight-comments/${commentId}/upvote`, {
      method: 'POST',
    });
  }

  async checkDisplayNameAvailability(displayName: string): Promise<{
    available: boolean;
    displayName: string;
  }> {
    return this.makeRequest(`/auth/check-displayname?displayName=${encodeURIComponent(displayName)}`, {
      method: 'GET',
    });
  }

  // ==================== SEARCH ====================

  async search(query: string, limit: number = 10): Promise<{
    data: {
      fighters: Array<{
        id: string;
        firstName: string;
        lastName: string;
        nickname?: string;
        profileImage?: string;
        weightClass?: string;
        rank?: string;
        wins: number;
        losses: number;
        draws: number;
        record: string;
        averageRating: number;
        totalFights: number;
        isChampion: boolean;
        championshipTitle?: string;
      }>;
      fights: Array<{
        id: string;
        isTitle: boolean;
        titleName?: string;
        weightClass?: string;
        scheduledRounds: number;
        hasStarted: boolean;
        isComplete: boolean;
        winner?: string;
        method?: string;
        round?: number;
        time?: string;
        averageRating: number;
        totalRatings: number;
        fighter1: {
          id: string;
          firstName: string;
          lastName: string;
          nickname?: string;
          profileImage?: string;
          weightClass?: string;
          rank?: string;
        };
        fighter2: {
          id: string;
          firstName: string;
          lastName: string;
          nickname?: string;
          profileImage?: string;
          weightClass?: string;
          rank?: string;
        };
        event: {
          id: string;
          name: string;
          promotion: string;
          date: string;
          location?: string;
        };
      }>;
      events: Array<{
        id: string;
        name: string;
        promotion: string;
        date: string;
        venue?: string;
        location?: string;
        bannerImage?: string;
        hasStarted: boolean;
        isComplete: boolean;
        averageRating: number;
        totalRatings: number;
        greatFights: number;
      }>;
      promotions: Array<{
        name: string;
        totalEvents: number;
        averageRating: number;
        upcomingEvents: number;
      }>;
    };
    meta: {
      query: string;
      totalResults: number;
    };
  }> {
    return this.makeRequest(`/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      method: 'GET',
    });
  }

  // ==================== FEEDBACK ====================

  async submitFeedback(
    content: string,
    platform?: string,
    appVersion?: string
  ): Promise<{
    message: string;
    feedbackId: string;
  }> {
    return this.makeRequest('/feedback', {
      method: 'POST',
      body: JSON.stringify({
        content,
        platform,
        appVersion,
      }),
    });
  }

  /**
   * Get user's prediction accuracy grouped by event
   * @param timeFilter - 'lastEvent' | 'month' | '3months' | 'year' | 'allTime'
   */
  async getPredictionAccuracyByEvent(timeFilter: string = '3months'): Promise<{
    accuracyByEvent: Array<{
      eventId: string;
      eventName: string;
      eventDate: string;
      correct: number;
      incorrect: number;
    }>;
    totalEvents: number;
    totalPredictions: number;
    totalCorrect: number;
    totalIncorrect: number;
  }> {
    return this.makeRequest(`/auth/profile/prediction-accuracy?timeFilter=${timeFilter}`);
  }

  /**
   * Get user's global standing/ranking based on prediction accuracy
   * @param timeFilter - 'lastEvent' | 'month' | '3months' | 'year' | 'allTime'
   */
  async getGlobalStanding(timeFilter: string = '3months'): Promise<{
    position: number | null;
    totalUsers: number;
    hasRanking: boolean;
    correctPredictions?: number;
    totalPredictions?: number;
    accuracy?: number;
    message?: string;
  }> {
    return this.makeRequest(`/auth/profile/global-standing?timeFilter=${timeFilter}`);
  }

  /**
   * Get user's most upvoted post-fight reviews/comments
   * @param limit - Maximum number of reviews to return (default 3, max 10)
   */
  async getMyTopReviews(limit: number = 3): Promise<{
    reviews: Array<{
      id: string;
      fightId: string;
      content: string;
      rating: number | null;
      upvotes: number;
      userHasUpvoted: boolean;
      createdAt: string;
      isReply: boolean;
      fight: {
        id: string;
        fighter1Name: string;
        fighter2Name: string;
        eventName: string;
        eventDate: string;
      };
    }>;
    totalWithUpvotes: number;
  }> {
    return this.makeRequest(`/fights/my-top-reviews?limit=${limit}`);
  }

  /**
   * Get user's comments with pagination (by individual comments)
   */
  async getMyComments(params: { page?: number; limit?: number; sortBy?: string } = {}): Promise<{
    reviews: Array<{
      id: string;
      fightId: string;
      content: string;
      rating: number | null;
      upvotes: number;
      userHasUpvoted: boolean;
      createdAt: string;
      isReply: boolean;
      fight: {
        id: string;
        fighter1Name: string;
        fighter2Name: string;
        eventName: string;
        eventDate: string;
      };
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', String(params.page));
    if (params.limit) queryParams.append('limit', String(params.limit));
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    const queryString = queryParams.toString();
    return this.makeRequest(`/fights/my-comments${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Get user's most upvoted pre-flight comments
   * @param limit - Maximum number of comments to return (default 3, max 10)
   */
  async getMyTopPreflightComments(limit: number = 3): Promise<{
    comments: Array<{
      id: string;
      fightId: string;
      content: string;
      hypeRating: number | null;
      predictedWinner: string | null;
      upvotes: number;
      userHasUpvoted: boolean;
      createdAt: string;
      isReply: boolean;
      fight: {
        id: string;
        fighter1Id: string;
        fighter2Id: string;
        fighter1Name: string;
        fighter2Name: string;
        eventName: string;
        eventDate: string;
      };
    }>;
    totalWithUpvotes: number;
  }> {
    return this.makeRequest(`/fights/my-top-preflight-comments?limit=${limit}`);
  }

  /**
   * Get user's pre-flight comments with pagination
   */
  async getMyPreflightComments(params: { page?: number; limit?: number; sortBy?: string } = {}): Promise<{
    comments: Array<{
      id: string;
      fightId: string;
      content: string;
      hypeRating: number | null;
      predictedWinner: string | null;
      upvotes: number;
      userHasUpvoted: boolean;
      createdAt: string;
      isReply: boolean;
      fight: {
        id: string;
        fighter1Id: string;
        fighter2Id: string;
        fighter1Name: string;
        fighter2Name: string;
        eventName: string;
        eventDate: string;
      };
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', String(params.page));
    if (params.limit) queryParams.append('limit', String(params.limit));
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    const queryString = queryParams.toString();
    return this.makeRequest(`/fights/my-preflight-comments${queryString ? `?${queryString}` : ''}`);
  }

  // ==================== EMAIL VERIFICATION ====================

  /**
   * Resend verification email to the user
   * @param email - User's email address
   */
  async resendVerificationEmail(email: string): Promise<{
    message: string;
  }> {
    return this.makeRequest('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }
}

export const apiService = new ApiService();
export const api = apiService; // Alias for convenience
export type { Fight, FightsResponse, ApiError };