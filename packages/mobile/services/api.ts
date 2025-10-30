import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform } from 'react-native';

// ⚙️ DEVELOPMENT CONFIG: Set to true to test production API while developing
const USE_PRODUCTION_API = false;

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
      return await AsyncStorage.getItem('accessToken');
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {

    const url = `${API_BASE_URL}${endpoint}`;
    const token = await this.getAuthToken();

    console.log('Making API request to:', url);
    console.log('Auth token available:', !!token, token ? `(${token.substring(0, 20)}...)` : '(none)');

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

  async getEvents(): Promise<{ events: any[] }> {
    return this.makeRequest('/events');
  }

  async getEvent(eventId: string): Promise<{ event: any }> {
    return this.makeRequest(`/events/${eventId}`);
  }

  async getEventFights(eventId: string): Promise<{ fights: Fight[] }> {
    return this.makeRequest(`/events/${eventId}/fights`);
  }

  async getEventEngagement(eventId: string): Promise<{
    totalFights: number;
    predictionsCount: number;
    ratingsCount: number;
    alertsCount: number;
    averageHype: number | null;
    topHypedFights: Array<{
      fightId: string;
      hype: number;
      fighter1: string;
      fighter2: string;
    }>;
  }> {
    return this.makeRequest(`/events/${eventId}/engagement`);
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
  }): Promise<{ prediction: any; message: string }> {
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
    };
    fighter1RoundPredictions: Record<number, number>;
    fighter2MethodPredictions: {
      DECISION: number;
      KO_TKO: number;
      SUBMISSION: number;
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

  async getTopUpcomingFights(): Promise<{ data: Fight[] }> {
    return this.makeRequest('/community/top-upcoming-fights');
  }

  async getTopRecentFights(): Promise<{ data: Fight[] }> {
    return this.makeRequest('/community/top-recent-fights');
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
}

export const apiService = new ApiService();
export const api = apiService; // Alias for convenience
export type { Fight, FightsResponse, ApiError };