import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform } from 'react-native';

const getApiBaseUrl = () => {
  const isDevelopment = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    return 'https://your-production-api.com/api';
  }

  // In development, use localhost for web and network IP for mobile
  if (Platform.OS === 'web') {
    return 'http://localhost:3008/api';
  } else {
    return 'http://10.0.0.53:3008/api';  // Network IP for mobile devices
  }
};

const API_BASE_URL = getApiBaseUrl();

interface Fight {
  id: string;
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
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
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

  async createCrewPrediction(crewId: string, fightId: string, data: {
    hypeLevel: number;
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
}

export const apiService = new ApiService();
export type { Fight, FightsResponse, ApiError };