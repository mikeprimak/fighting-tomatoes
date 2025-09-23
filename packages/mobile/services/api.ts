import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = __DEV__
  ? 'http://10.0.0.53:3007/api'  // This matches your server
  : 'https://your-production-api.com/api';

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
}

export const apiService = new ApiService();
export type { Fight, FightsResponse, ApiError };